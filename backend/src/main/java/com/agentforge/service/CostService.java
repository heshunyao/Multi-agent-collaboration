package com.agentforge.service;

import com.agentforge.common.Ids;
import com.agentforge.domain.CostRecord;
import com.agentforge.domain.ModelConfig;
import com.agentforge.repo.CostRecordRepository;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 费用：按上下文与输出长度估算 token，并依据模型价格字符串折算金额。 */
@Service
public class CostService {

    private static final Pattern PRICE = Pattern.compile("(\\d+(?:\\.\\d+)?)");

    private final CostRecordRepository repository;

    public CostService(CostRecordRepository repository) {
        this.repository = repository;
    }

    public void recordChat(String conversationId, String agentId, ModelConfig model, String prompt, String completion) {
        recordChat(conversationId, agentId, model, estimateTokens(prompt), estimateTokens(completion));
    }

    public void recordChat(String conversationId, String agentId, ModelConfig model,
                           int promptTokens, int completionTokens) {
        CostRecord record = new CostRecord();
        record.id = Ids.shortId("cost");
        record.conversationId = conversationId;
        record.agentId = agentId;
        record.modelId = model == null ? null : model.id;
        record.promptTokens = promptTokens;
        record.completionTokens = completionTokens;
        record.totalTokens = promptTokens + completionTokens;
        record.currency = model != null && model.price != null && model.price.contains("¥") ? "CNY" : "USD";
        record.amount = estimateAmount(model, record.totalTokens);
        record.createdAt = System.currentTimeMillis();
        repository.save(record);
    }

    public List<CostRecord> recent() {
        return repository.findTop200ByOrderByCreatedAtDesc();
    }

    public List<CostRecord> byConversation(String conversationId) {
        return repository.findByConversationIdOrderByCreatedAtAsc(conversationId);
    }

    public Map<String, Object> summary() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalTokens", repository.sumTotalTokens());
        result.put("totalAmount", Math.round(repository.sumAmount() * 10000) / 10000.0);
        result.put("currency", "USD/CNY 混用，按模型价格标记");
        result.put("recordCount", repository.count());
        return result;
    }

    /** 中文按 1 token/字、其余按 4 字符/token 粗略估算。 */
    public static int estimateTokens(String text) {
        if (text == null || text.isEmpty()) {
            return 0;
        }
        int cjk = 0;
        int other = 0;
        for (int i = 0; i < text.length(); i++) {
            if (text.charAt(i) >= 0x2E80) {
                cjk++;
            } else {
                other++;
            }
        }
        return cjk + (int) Math.ceil(other / 4.0);
    }

    private double estimateAmount(ModelConfig model, int tokens) {
        if (model == null || model.price == null) {
            return 0;
        }
        Matcher matcher = PRICE.matcher(model.price);
        if (!matcher.find()) {
            return 0;
        }
        try {
            double perMillion = Double.parseDouble(matcher.group(1));
            return Math.round(tokens / 1_000_000.0 * perMillion * 10000) / 10000.0;
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
