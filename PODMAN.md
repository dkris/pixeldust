# Podman Support in PixelDust

PixelDust has **native Podman support** with automatic detection and configuration. This guide explains how to use Podman instead of Docker for running containerized tests.

## Why Podman?

- **Rootless by default**: Enhanced security without privileged access
- **Daemonless**: No background daemon required
- **Docker-compatible**: Uses the same OCI container format
- **Lightweight**: Lower resource overhead
- **SELinux integration**: Better security on RHEL/Fedora systems

## Requirements

- Podman 3.0 or higher
- Enabled Podman socket (for API access)

## Quick Start

### 1. Install Podman

#### Fedora/RHEL/CentOS
```bash
sudo dnf install podman
```

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install podman
```

#### macOS
```bash
brew install podman
podman machine init
podman machine start
```

#### Windows
Download from: https://podman.io/getting-started/installation

### 2. Enable Podman Socket

The Podman socket provides Docker-compatible API access.

#### Rootless (Recommended)
```bash
systemctl --user enable --now podman.socket
systemctl --user status podman.socket
```

Socket location: `/run/user/{uid}/podman/podman.sock`

#### Rootful
```bash
sudo systemctl enable --now podman.socket
sudo systemctl status podman.socket
```

Socket location: `/run/podman/podman.sock`

### 3. Configure PixelDust

In your `.pixeldustrc.json`, set the runtime to `podman`:

```json
{
  "framework": {
    "name": "ui5-webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "containers": {
    "runtime": "podman",  // ← Use Podman
    "baseImage": "node:18-alpine",
    "resources": {
      "memory": "2g",
      "cpu": 2
    }
  }
}
```

### 4. Run Tests

```bash
pixeldust test
```

PixelDust will automatically:
- ✅ Detect Podman socket location
- ✅ Determine rootless/rootful mode
- ✅ Configure API connection
- ✅ Run containers using Podman

## Configuration Options

### Auto-Detection

Omit the `runtime` field to auto-detect:

```json
{
  "containers": {
    "baseImage": "node:18-alpine",
    "resources": {
      "memory": "2g",
      "cpu": 2
    }
  }
}
```

PixelDust will prefer Docker if both are installed.

### Explicit Runtime Selection

Force Podman even if Docker is available:

```json
{
  "containers": {
    "runtime": "podman",
    "baseImage": "node:18-alpine",
    "resources": {
      "memory": "2g",
      "cpu": 2
    }
  }
}
```

## Rootless vs Rootful Podman

### Rootless (Recommended)

**Advantages:**
- No root privileges required
- Better security isolation
- Per-user containers
- No daemon required

**Setup:**
```bash
# Enable rootless socket
systemctl --user enable --now podman.socket

# Verify
systemctl --user status podman.socket

# Test
podman run --rm alpine echo "Hello from rootless Podman"
```

**Socket path:** `/run/user/$(id -u)/podman/podman.sock`

### Rootful

**When to use:**
- Need privileged containers
- Port binding < 1024
- System-wide containers

**Setup:**
```bash
# Enable rootful socket
sudo systemctl enable --now podman.socket

# Verify
sudo systemctl status podman.socket

# Test
sudo podman run --rm alpine echo "Hello from rootful Podman"
```

**Socket path:** `/run/podman/podman.sock`

## Socket Detection

PixelDust automatically checks these locations in order:

1. `/run/user/{uid}/podman/podman.sock` (rootless)
2. `/run/podman/podman.sock` (rootful)
3. `$HOME/.local/share/containers/podman/machine/podman.sock` (Podman Machine)
4. `$XDG_RUNTIME_DIR/podman/podman.sock` (XDG-compliant)

## Troubleshooting

### Socket Not Found

**Error:**
```
Podman socket not found. Please ensure Podman socket is enabled
```

**Solution:**
```bash
# For rootless
systemctl --user enable --now podman.socket
systemctl --user status podman.socket

# For rootful
sudo systemctl enable --now podman.socket
sudo systemctl status podman.socket
```

### Permission Denied

**Error:**
```
Error: Permission denied accessing socket
```

**Solution for rootless:**
```bash
# Check socket permissions
ls -l /run/user/$(id -u)/podman/podman.sock

# Restart socket
systemctl --user restart podman.socket
```

**Solution for rootful:**
```bash
# Add user to podman group
sudo usermod -aG podman $USER

# Log out and back in
```

### Port Binding Issues (Rootless)

**Issue:** Rootless Podman cannot bind to ports < 1024

**Solution 1 - Use high ports:**
```json
{
  "testing": {
    "viewport": { "width": 1920, "height": 1080 },
    "port": 3000  // Use port > 1024
  }
}
```

**Solution 2 - Enable unprivileged port binding:**
```bash
sudo sysctl net.ipv4.ip_unprivileged_port_start=80
```

### Container Cleanup

**Manual cleanup:**
```bash
# List all containers
podman ps -a

# Stop all PixelDust containers
podman stop $(podman ps -a -q --filter "name=pixeldust-*")

# Remove all PixelDust containers
podman rm $(podman ps -a -q --filter "name=pixeldust-*")

# Clean up volumes and images
podman system prune -a
```

## Podman Compose (Alternative)

While PixelDust uses the Podman API directly, you can also use Podman Compose:

```bash
# Install podman-compose
pip install podman-compose

# It's compatible with Docker Compose files
podman-compose version
```

## Performance Comparison

| Feature | Docker | Podman Rootless | Podman Rootful |
|---------|--------|-----------------|----------------|
| Startup Time | ~2s | ~1s | ~1.5s |
| Memory Overhead | ~400MB | ~100MB | ~150MB |
| Security | Good | Excellent | Good |
| Privileged Access | Required | Not Required | Required |

## Advanced Configuration

### Custom Socket Path

Set via environment variable:

```bash
export PODMAN_SOCKET=/custom/path/podman.sock
pixeldust test
```

### Network Isolation

```json
{
  "containers": {
    "runtime": "podman",
    "network": {
      "mode": "bridge"  // or "host", "none"
    }
  }
}
```

### Resource Limits

Podman respects cgroups v2 limits:

```json
{
  "containers": {
    "runtime": "podman",
    "resources": {
      "memory": "2g",      // Memory limit
      "cpu": 2,            // CPU cores
      "cpuShares": 1024,   // CPU shares (optional)
      "pidsLimit": 100     // Process limit (optional)
    }
  }
}
```

## Podman Machine (macOS/Windows)

On macOS/Windows, Podman runs in a VM:

### Initialize Machine
```bash
podman machine init --cpus 4 --memory 4096 --disk-size 50
```

### Start Machine
```bash
podman machine start
```

### Check Status
```bash
podman machine list
podman machine inspect
```

### Set Socket Path
```bash
export PODMAN_SOCKET=$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')
```

## Migration from Docker

### Configuration Changes

**Before (Docker):**
```json
{
  "containers": {
    "runtime": "docker",
    "baseImage": "node:18-alpine"
  }
}
```

**After (Podman):**
```json
{
  "containers": {
    "runtime": "podman",
    "baseImage": "node:18-alpine"
  }
}
```

That's it! Everything else works the same.

### Alias for Compatibility

```bash
# Add to ~/.bashrc or ~/.zshrc
alias docker=podman

# Now Docker commands use Podman
docker ps
docker run alpine echo "Hello"
```

## CI/CD Integration

### GitHub Actions with Podman

```yaml
name: PixelDust Tests with Podman

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Install Podman
        run: |
          sudo apt-get update
          sudo apt-get install -y podman

      - name: Enable Podman Socket
        run: |
          systemctl --user enable --now podman.socket

      - name: Install PixelDust
        run: npm install -g @pixeldust/ui-version-tester

      - name: Run Tests
        run: pixeldust test --config .pixeldustrc.json
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### GitLab CI with Podman

```yaml
test:
  image: quay.io/podman/stable
  script:
    - podman info
    - npm install -g @pixeldust/ui-version-tester
    - pixeldust test
  variables:
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
```

## Security Best Practices

### 1. Use Rootless Mode
```bash
systemctl --user enable --now podman.socket
```

### 2. Limit Resource Usage
```json
{
  "containers": {
    "resources": {
      "memory": "2g",
      "cpu": 2
    }
  }
}
```

### 3. Use Read-Only Root Filesystem
```json
{
  "containers": {
    "securityOpt": ["no-new-privileges"],
    "readOnly": true
  }
}
```

### 4. Regular Updates
```bash
# Update Podman
sudo dnf update podman  # Fedora/RHEL
sudo apt update && sudo apt upgrade podman  # Ubuntu/Debian
```

## References

- [Podman Official Documentation](https://docs.podman.io/)
- [Podman vs Docker](https://podman.io/whatis.html)
- [Rootless Containers](https://docs.podman.io/en/latest/markdown/podman-run.1.html#rootless-mode)
- [Podman API](https://docs.podman.io/en/latest/markdown/podman-system-service.1.html)

## FAQ

### Q: Can I use both Docker and Podman?
**A:** Yes! Specify the runtime in your config, or use different configs for each.

### Q: Is Podman slower than Docker?
**A:** No, Podman is typically faster due to no daemon overhead.

### Q: Do I need to change my Dockerfiles?
**A:** No, Podman uses the same Dockerfile format and OCI images.

### Q: Can I use Docker Hub images?
**A:** Yes, Podman pulls from Docker Hub by default (docker.io).

### Q: What about Docker Compose files?
**A:** Use `podman-compose` for compose file support.

## Support

If you encounter issues with Podman support:

1. Check Podman socket is running: `systemctl --user status podman.socket`
2. Verify Podman works: `podman run --rm alpine echo "test"`
3. Check logs: `journalctl --user -u podman.socket`
4. Open an issue: https://github.com/pixeldust/pixeldust/issues

---

**Happy testing with Podman!** 🚀
