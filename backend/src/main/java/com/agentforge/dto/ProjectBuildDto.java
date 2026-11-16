package com.agentforge.dto;

import com.agentforge.domain.ProjectStage;
import com.agentforge.domain.TaskItem;

import java.util.List;

/** 一次 AI 项目构建的详情。 */
public record ProjectBuildDto(String id, String projectId, String projectName, String stack, String requirement,
                              String status, String currentStage, String summary,
                              int stageCount, int doneStages, int fileCount, int testRounds,
                              String lastTestOutput, boolean testsPassed, String gitCommit, String gitBranch,
                              long createdAt, long startedAt, long finishedAt, long updatedAt,
                              List<ProjectStage> stages, List<TaskItem> tasks) {
}
