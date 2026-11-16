package com.agentforge.dto;

/** 项目列表项（附带最近一次构建的概要）。 */
public record ProjectSummaryDto(String id, String name, String description, String status, String stack,
                                String requirement, String workspacePath, long createdAt, long updatedAt,
                                String buildId, String buildStatus, String currentStage,
                                int fileCount, int testRounds, long lastBuildAt) {
}
