package com.agentforge.dto;

import java.util.List;

public record ModelListResult(boolean ok, List<ModelOption> models, String error) {

    public static ModelListResult ok(List<ModelOption> models) {
        return new ModelListResult(true, models, null);
    }

    public static ModelListResult fail(String error) {
        return new ModelListResult(false, List.of(), error);
    }
}
