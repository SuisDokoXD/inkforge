// C13: Image generation service — ComfyUI / SD WebUI HTTP client
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { getAppContext } from "./app-state";
import { getProject } from "@inkforge/storage";
import type { ImageGenRequest, ImageGenResult, ImageGenSettings } from "@inkforge/shared";

const DEFAULT_COMFY_URL = "http://localhost:8188";
const DEFAULT_SD_URL = "http://localhost:7860";
const TIMEOUT_MS = 120_000;

function getSettings(): ImageGenSettings {
  const ctx = getAppContext();
  const rows = ctx.db.prepare(`SELECT value FROM app_settings WHERE key = 'imageGenBackend'`).get() as { value: string } | undefined;
  const urlRow = ctx.db.prepare(`SELECT value FROM app_settings WHERE key = 'imageGenApiUrl'`).get() as { value: string } | undefined;
  return {
    backend: (rows?.value as ImageGenSettings["backend"]) ?? "none",
    apiUrl: urlRow?.value ?? DEFAULT_COMFY_URL,
  };
}

async function saveImage(base64: string, projectId: string): Promise<string> {
  const ctx = getAppContext();
  const project = getProject(ctx.db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const imgDir = path.join(project.path, ".inkforge", "images");
  await fs.mkdir(imgDir, { recursive: true });

  const buf = Buffer.from(base64, "base64");
  const fileName = `gen_${Date.now()}_${randomUUID().slice(0, 4)}.png`;
  const filePath = path.join(imgDir, fileName);
  await fs.writeFile(filePath, buf);

  return path.relative(project.path, `.inkforge/images/${fileName}`);
}

export async function generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
  const settings = getSettings();
  if (settings.backend === "none") {
    return { success: false, error: "请在设置中配置图片生成后端" };
  }

  try {
    let dataUrl: string;
    if (settings.backend === "sdwebui") {
      dataUrl = await generateSDWebUI(settings.apiUrl || DEFAULT_SD_URL, request);
    } else {
      dataUrl = await generateComfyUI(settings.apiUrl || DEFAULT_COMFY_URL, request);
    }

    const imagePath = await saveImage(dataUrl.split(",")[1] ?? dataUrl, request.projectId);
    return { success: true, imagePath, dataUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `生成失败：${msg}` };
  }
}

async function generateSDWebUI(baseUrl: string, req: ImageGenRequest): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/sdapi/v1/txt2img`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: req.prompt,
        negative_prompt: req.negativePrompt ?? "",
        width: req.width,
        height: req.height,
        steps: 20,
        cfg_scale: 7,
        sampler_name: "Euler a",
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`SD WebUI 返回 ${resp.status}: ${text.slice(0, 200)}`);
    }

    const json = await resp.json() as { images?: string[] };
    if (!json.images?.[0]) throw new Error("SD WebUI 未返回图片数据");
    return `data:image/png;base64,${json.images[0]}`;
  } finally {
    clearTimeout(timer);
  }
}

async function generateComfyUI(baseUrl: string, req: ImageGenRequest): Promise<string> {
  const base = baseUrl.replace(/\/$/, "");
  const promptId = await queueComfyUI(base, req);
  const filename = await pollComfyUI(base, promptId);
  const imageBase64 = await fetchComfyUIImage(base, filename);
  return `data:image/png;base64,${imageBase64}`;
}

async function queueComfyUI(baseUrl: string, req: ImageGenRequest): Promise<string> {
  const workflow = {
    "3": { "class_type": "KSampler", "inputs": { "seed": Math.floor(Math.random() * 1e9), "steps": 20, "cfg": 7, "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
    "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "sd_xl_base_1.0.safetensors" } },
    "5": { "class_type": "EmptyLatentImage", "inputs": { "width": req.width, "height": req.height, "batch_size": 1 } },
    "6": { "class_type": "CLIPTextEncode", "inputs": { "text": req.prompt, "clip": ["4", 1] } },
    "7": { "class_type": "CLIPTextEncode", "inputs": { "text": req.negativePrompt ?? "", "clip": ["4", 1] } },
    "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
    "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "inkforge", "images": ["8", 0] } },
  };

  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  const json = await resp.json() as { prompt_id?: string; error?: string };
  if (json.error) throw new Error(`ComfyUI: ${json.error}`);
  if (!json.prompt_id) throw new Error("ComfyUI 未返回 prompt_id");
  return json.prompt_id;
}

async function pollComfyUI(baseUrl: string, promptId: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/history/${promptId}`);
    const json = await resp.json() as Record<string, { outputs?: Record<string, { images?: Array<{ filename: string }> }> }>;
    const history = json[promptId];
    if (history?.outputs) {
      for (const out of Object.values(history.outputs)) {
        if (out.images?.[0]?.filename) return out.images[0].filename;
      }
    }
  }
  throw new Error("ComfyUI 生成超时");
}

async function fetchComfyUIImage(baseUrl: string, filename: string): Promise<string> {
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/view?filename=${encodeURIComponent(filename)}&subfolder=&type=output`);
  const buf = await resp.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}
