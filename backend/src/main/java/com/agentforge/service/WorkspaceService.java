package com.agentforge.service;

import com.agentforge.common.ApiException;
import com.agentforge.dto.FileNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * 项目工作区文件管理：所有 AI 生成与人工编辑的文件都落在 workspaces/&lt;projectId&gt; 下。
 * 所有相对路径统一做归一化与越界校验，禁止读写工作区之外的路径。
 */
@Service
public class WorkspaceService {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceService.class);
    private static final long MAX_READ_BYTES = 1024 * 1024;
    private static final int MAX_TREE_ENTRIES = 2000;
    private static final Set<String> SKIP_DIRS = Set.of(
            ".git", "node_modules", "target", "dist", ".venv", "__pycache__",
            ".build-test", ".testclasses", "out", ".idea", ".gradle");

    private final Path root;

    public WorkspaceService(@Value("${agentforge.workspace.root:workspaces}") String rootDir) {
        this.root = Paths.get(rootDir).toAbsolutePath().normalize();
    }

    public Path root() {
        return root;
    }

    public Path projectRoot(String projectId) {
        Path path = root.resolve(projectId).normalize();
        if (!path.startsWith(root)) {
            throw ApiException.badRequest("非法工作区路径");
        }
        return path;
    }

    public String relativePath(String projectId) {
        return root.relativize(projectRoot(projectId)).toString().replace('\\', '/');
    }

    public Path ensureProjectRoot(String projectId) {
        Path path = projectRoot(projectId);
        try {
            Files.createDirectories(path);
            return path;
        } catch (IOException e) {
            throw new ApiException(500, "创建工作区失败：" + e.getMessage());
        }
    }

    /** 把工作区相对路径解析为绝对路径，并阻止 ../ 越界与绝对路径。 */
    public Path resolve(String projectId, String relative) {
        if (relative == null || relative.isBlank()) {
            throw ApiException.badRequest("文件路径不能为空");
        }
        String cleaned = relative.replace('\\', '/').trim();
        if (cleaned.startsWith("/") || cleaned.matches("^[A-Za-z]:.*")) {
            throw ApiException.badRequest("只允许工作区内的相对路径");
        }
        Path base = projectRoot(projectId);
        Path resolved = base.resolve(cleaned).normalize();
        if (!resolved.startsWith(base) || resolved.equals(base)) {
            throw ApiException.badRequest("非法文件路径：" + relative);
        }
        return resolved;
    }

    public List<FileNode> tree(String projectId) {
        Path base = projectRoot(projectId);
        if (!Files.exists(base)) {
            return List.of();
        }
        int[] budget = {MAX_TREE_ENTRIES};
        return listChildren(base, base, 1, budget);
    }

    private List<FileNode> listChildren(Path dir, Path base, int depth, int[] budget) {
        List<FileNode> nodes = new ArrayList<>();
        if (depth > 10 || budget[0] <= 0) {
            return nodes;
        }
        try (var stream = Files.list(dir)) {
            List<Path> children = stream
                    .filter(path -> !SKIP_DIRS.contains(path.getFileName().toString()))
                    .sorted(Comparator
                            .comparing((Path path) -> Files.isDirectory(path) ? 0 : 1)
                            .thenComparing(path -> path.getFileName().toString().toLowerCase()))
                    .toList();
            for (Path child : children) {
                if (budget[0]-- <= 0) {
                    break;
                }
                String relative = base.relativize(child).toString().replace('\\', '/');
                if (Files.isDirectory(child)) {
                    nodes.add(new FileNode(child.getFileName().toString(), relative, "dir", 0,
                            child.toFile().lastModified(), listChildren(child, base, depth + 1, budget)));
                } else {
                    long size;
                    long updated;
                    try {
                        size = Files.size(child);
                    } catch (IOException e) {
                        size = 0;
                    }
                    updated = child.toFile().lastModified();
                    nodes.add(new FileNode(child.getFileName().toString(), relative, "file", size, updated, List.of()));
                }
            }
        } catch (IOException e) {
            log.warn("读取工作区目录失败 {}", dir, e);
        }
        return nodes;
    }

    public int countFiles(String projectId) {
        Path base = projectRoot(projectId);
        if (!Files.exists(base)) {
            return 0;
        }
        try (var stream = Files.walk(base)) {
            return (int) stream
                    .filter(Files::isRegularFile)
                    .filter(path -> !isSkipped(base.relativize(path)))
                    .count();
        } catch (IOException e) {
            return 0;
        }
    }

    private boolean isSkipped(Path relative) {
        for (Path part : relative) {
            if (SKIP_DIRS.contains(part.toString())) {
                return true;
            }
        }
        return false;
    }

    public String readFile(String projectId, String relative) {
        Path path = resolve(projectId, relative);
        if (!Files.exists(path) || Files.isDirectory(path)) {
            throw ApiException.notFound("文件不存在：" + relative);
        }
        try {
            if (Files.size(path) > MAX_READ_BYTES) {
                throw ApiException.badRequest("文件过大，无法在线预览（超过 1MB）");
            }
            return Files.readString(path, StandardCharsets.UTF_8);
        } catch (ApiException e) {
            throw e;
        } catch (IOException e) {
            throw new ApiException(500, "读取文件失败：" + e.getMessage());
        }
    }

    public long writeFile(String projectId, String relative, String content) {
        Path path = resolve(projectId, relative);
        try {
            Path parent = path.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            byte[] data = (content == null ? "" : content).getBytes(StandardCharsets.UTF_8);
            Files.write(path, data);
            return data.length;
        } catch (IOException e) {
            throw new ApiException(500, "写入文件失败：" + e.getMessage());
        }
    }

    public void deleteFile(String projectId, String relative) {
        Path path = resolve(projectId, relative);
        try {
            if (!Files.exists(path)) {
                throw ApiException.notFound("文件不存在：" + relative);
            }
            if (Files.isDirectory(path)) {
                deleteRecursively(path);
            } else {
                Files.delete(path);
            }
        } catch (IOException e) {
            throw new ApiException(500, "删除失败：" + e.getMessage());
        }
    }

    public byte[] zip(String projectId) {
        Path base = projectRoot(projectId);
        if (!Files.exists(base) || countFiles(projectId) == 0) {
            throw ApiException.badRequest("工作区还没有生成任何文件");
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8);
             var stream = Files.walk(base)) {
            for (Path path : stream.filter(Files::isRegularFile).toList()) {
                Path relative = base.relativize(path);
                if (isSkipped(relative)) {
                    continue;
                }
                zip.putNextEntry(new ZipEntry(relative.toString().replace('\\', '/')));
                try (InputStream input = Files.newInputStream(path)) {
                    input.transferTo(zip);
                }
                zip.closeEntry();
            }
        } catch (IOException e) {
            throw new ApiException(500, "打包项目失败：" + e.getMessage());
        }
        return bytes.toByteArray();
    }

    public void deleteWorkspace(String projectId) {
        Path base = projectRoot(projectId);
        try {
            if (Files.exists(base)) {
                deleteRecursively(base);
            }
        } catch (IOException e) {
            log.warn("删除工作区失败 {}", base, e);
        }
    }

    private void deleteRecursively(Path path) throws IOException {
        try (var stream = Files.walk(path)) {
            for (Path item : stream.sorted(Comparator.reverseOrder()).toList()) {
                try {
                    Files.deleteIfExists(item);
                } catch (IOException e) {
                    // Windows 下 git 对象等文件可能带只读属性，先解除再删除
                    if (!item.toFile().setWritable(true)) {
                        throw e;
                    }
                    Files.deleteIfExists(item);
                }
            }
        }
    }
}
