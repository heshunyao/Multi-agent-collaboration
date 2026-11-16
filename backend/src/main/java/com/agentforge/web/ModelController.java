package com.agentforge.web;

import com.agentforge.dto.ModelDto;
import com.agentforge.dto.ModelInput;
import com.agentforge.dto.ModelListRequest;
import com.agentforge.dto.ModelListResult;
import com.agentforge.dto.ModelTestRequest;
import com.agentforge.dto.ModelTestResult;
import com.agentforge.service.ModelService;
import com.agentforge.service.ModelTestService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/models")
public class ModelController {

    private final ModelService modelService;
    private final ModelTestService modelTestService;

    public ModelController(ModelService modelService, ModelTestService modelTestService) {
        this.modelService = modelService;
        this.modelTestService = modelTestService;
    }

    @GetMapping
    public List<ModelDto> list() {
        return modelService.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ModelDto create(@RequestBody ModelInput input) {
        return modelService.create(input);
    }

    @PutMapping("/{id}")
    public ModelDto update(@PathVariable String id, @RequestBody ModelInput input) {
        return modelService.update(id, input);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        modelService.delete(id);
        return Map.of("ok", true);
    }

    @PostMapping("/test")
    public ModelTestResult test(@RequestBody ModelTestRequest request) {
        return modelTestService.test(request);
    }

    /** 拉取供应商可用模型列表，前端用于选择模型标识。 */
    @PostMapping("/available")
    public ModelListResult available(@RequestBody ModelListRequest request) {
        return modelTestService.listModels(request);
    }
}
