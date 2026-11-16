package com.agentforge.web;

import com.agentforge.common.ApiException;
import com.agentforge.common.Ids;
import com.agentforge.domain.Role;
import com.agentforge.domain.User;
import com.agentforge.repo.RoleRepository;
import com.agentforge.repo.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 用户与权限：单用户开发态，登录页接入前先提供数据模型与接口。 */
@RestController
@RequestMapping("/api")
public class UserController {

    public record UserInput(String username, String displayName, String email, String roleId, Boolean enabled) {
    }

    public record RoleInput(String code, String name, String description, List<String> permissions) {
    }

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;

    public UserController(UserRepository userRepository, RoleRepository roleRepository) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
    }

    @GetMapping("/users/me")
    public Map<String, Object> me() {
        User user = userRepository.findByUsername("dev")
                .orElseThrow(() -> ApiException.notFound("开发用户不存在"));
        Role role = user.roleId == null ? null : roleRepository.findById(user.roleId).orElse(null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("user", user);
        result.put("role", role);
        result.put("permissions", role == null ? List.of() : role.permissions);
        return result;
    }

    @GetMapping("/users")
    public List<User> users() {
        return userRepository.findAll();
    }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    public User createUser(@RequestBody UserInput input) {
        if (input.username() == null || input.username().isBlank()) {
            throw ApiException.badRequest("用户名不能为空");
        }
        if (userRepository.findByUsername(input.username()).isPresent()) {
            throw ApiException.conflict("用户名已存在");
        }
        User user = new User();
        user.id = Ids.shortId("user");
        user.username = input.username().trim();
        user.displayName = input.displayName() == null ? user.username : input.displayName();
        user.email = input.email();
        user.roleId = input.roleId();
        user.enabled = input.enabled() == null || input.enabled();
        user.createdAt = System.currentTimeMillis();
        return userRepository.save(user);
    }

    @PutMapping("/users/{id}")
    public User updateUser(@PathVariable String id, @RequestBody UserInput input) {
        User user = userRepository.findById(id).orElseThrow(() -> ApiException.notFound("用户不存在"));
        if (input.displayName() != null) {
            user.displayName = input.displayName();
        }
        if (input.email() != null) {
            user.email = input.email();
        }
        if (input.roleId() != null) {
            user.roleId = input.roleId();
        }
        if (input.enabled() != null) {
            user.enabled = input.enabled();
        }
        return userRepository.save(user);
    }

    @GetMapping("/roles")
    public List<Role> roles() {
        return roleRepository.findAll();
    }

    @PostMapping("/roles")
    @ResponseStatus(HttpStatus.CREATED)
    public Role createRole(@RequestBody RoleInput input) {
        if (input.code() == null || input.code().isBlank()) {
            throw ApiException.badRequest("角色编码不能为空");
        }
        if (roleRepository.findByCode(input.code()).isPresent()) {
            throw ApiException.conflict("角色编码已存在");
        }
        Role role = new Role();
        role.id = Ids.shortId("role");
        role.code = input.code().trim();
        role.name = input.name() == null ? role.code : input.name();
        role.description = input.description();
        if (input.permissions() != null) {
            role.permissions.addAll(input.permissions());
        }
        role.createdAt = System.currentTimeMillis();
        return roleRepository.save(role);
    }
}
