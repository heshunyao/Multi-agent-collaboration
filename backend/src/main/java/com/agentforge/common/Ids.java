package com.agentforge.common;

import java.security.SecureRandom;
import java.util.UUID;

public final class Ids {

    private Ids() {
    }

    /** 与前端既有 ID 风格保持一致：prefix-8位短码。 */
    public static String shortId(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }

    public static String randomKey() {
        byte[] bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
