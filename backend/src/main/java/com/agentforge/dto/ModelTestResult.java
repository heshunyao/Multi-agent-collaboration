package com.agentforge.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ModelTestResult(boolean ok, Long latency, String detail, String error) {

    public static ModelTestResult ok(long latency, String detail) {
        return new ModelTestResult(true, latency, detail, null);
    }

    public static ModelTestResult fail(long latency, String error) {
        return new ModelTestResult(false, latency, null, error);
    }

    public static ModelTestResult fail(String error) {
        return new ModelTestResult(false, null, null, error);
    }
}
