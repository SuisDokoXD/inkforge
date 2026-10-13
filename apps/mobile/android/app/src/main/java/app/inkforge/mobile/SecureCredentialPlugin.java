package app.inkforge.mobile;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureCredential")
public class SecureCredentialPlugin extends Plugin {
    private static final String KEY_ALIAS = "inkforge.mobile.api-key.v1";
    private static final String PREFS = "inkforge_secure_credentials";
    private static final String IV = "api_key_iv";
    private static final String CIPHERTEXT = "api_key_ciphertext";

    @PluginMethod
    public void get(PluginCall call) {
        try {
            SharedPreferences prefs = preferences();
            String encodedIv = prefs.getString(IV, null);
            String encodedCiphertext = prefs.getString(CIPHERTEXT, null);
            if (encodedIv == null || encodedCiphertext == null) {
                call.resolve(new JSObject().put("value", ""));
                return;
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)));
            byte[] cleartext = cipher.doFinal(Base64.decode(encodedCiphertext, Base64.NO_WRAP));
            call.resolve(new JSObject().put("value", new String(cleartext, StandardCharsets.UTF_8)));
        } catch (Exception error) {
            call.reject("Saved API Key could not be decrypted. Clear it and enter it again.");
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.isEmpty()) {
            call.reject("API Key cannot be empty.");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getKey());
            byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            boolean saved = preferences().edit()
                .putString(IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString(CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .commit();
            if (!saved) {
                call.reject("API Key could not be saved to secure storage.");
                return;
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("API Key could not be encrypted for secure storage.");
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        boolean cleared = preferences().edit().remove(IV).remove(CIPHERTEXT).commit();
        if (!cleared) {
            call.reject("Saved API Key could not be removed.");
            return;
        }
        call.resolve();
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
    }

    private SecretKey getKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }
}
