package com.agentforge.dto;

import com.agentforge.domain.GitCommit;

import java.util.List;

/** 项目详情：最近构建、文件树、Git 记录。 */
public record ProjectDetailDto(String id, String name, String description, String status, String stack,
                               String requirement, String workspacePath,
                               long createdAt, long updatedAt,
                               ProjectBuildDto latestBuild, List<GitCommit> commits,
                               List<FileNode> files, int fileCount) {
}
