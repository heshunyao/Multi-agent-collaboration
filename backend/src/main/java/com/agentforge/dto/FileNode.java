package com.agentforge.dto;

import java.util.List;

/** 工作区文件树节点。 */
public record FileNode(String name, String path, String type, long size, long updatedAt, List<FileNode> children) {
}
