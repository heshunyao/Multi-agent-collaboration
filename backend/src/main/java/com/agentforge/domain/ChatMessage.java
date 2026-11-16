package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "chat_messages", indexes = {
        @Index(name = "idx_chat_messages_conversation", columnList = "conversationId, createdAt")
})
public class ChatMessage {

    @Id
    public String id;

    public String conversationId;

    /** user / assistant / system / tool */
    public String role;

    @Lob
    public String content;

    @Lob
    public String reasoning;

    public String modelId;

    /** 会话内自增序号，保证同一毫秒写入的消息顺序稳定。 */
    public long seq;

    public long createdAt;

    public boolean aborted;

    public boolean error;
}
