package com.agentforge.common;

/** 浏览器已断开（SSE 写出失败），用于中止上游推理。 */
public class ClientAbortException extends RuntimeException {

    public ClientAbortException() {
        super("client disconnected");
    }
}
