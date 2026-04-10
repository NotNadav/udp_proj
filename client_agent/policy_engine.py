
import json
import os
import signal
import threading

try:
    import urllib.request
    import urllib.error
    _HTTP_AVAILABLE = True
except ImportError:
    _HTTP_AVAILABLE = False


class PolicyEngine:
    def __init__(
        self,
        api_url: str | None = None,
        api_token: str | None = None,
        sync_interval: int = 60,
    ):
        self.api_url       = api_url or os.environ.get("MANAGE_SERVER_URL", "http://127.0.0.1:3001")
        self.api_token     = api_token or os.environ.get("PROXY_API_TOKEN", "")
        self.sync_interval = sync_interval
        self._lock         = threading.Lock()
        
        # default rules (in-memory only)
        self.rules = {"blocked_domains": [], "tunnel_domains": [], "default_action": "DIRECT"}

        if self.api_token and _HTTP_AVAILABLE:
            # perform mandatory initial sync before processing traffic
            initial = self._fetch_remote_rules()
            if initial:
                self.rules = initial
                print("policy engine: Rules fetched from management server.")
            
            self._start_sync()

    def _fetch_remote_rules(self) -> dict | None:
        # fetch rules from the api
        try:
            req = urllib.request.Request(
                f"{self.api_url}/api/rules",
                headers={"Authorization": f"Bearer {self.api_token}"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 401:
                print("[!] Access Revoked: Admin triggered Killswitch. Shutting down immediately.")
                os.kill(os.getpid(), signal.SIGTERM)
            print(f"policy engine: Remote sync failed: {e}")
            return None
        except Exception as exc:
            print(f"policy engine: Remote sync failed: {exc}")
            return None

    def _sync_loop(self):
        import time
        while True:
            time.sleep(self.sync_interval)
            remote = self._fetch_remote_rules()
            if remote:
                with self._lock:
                    self.rules = remote
                print("policy engine: Rules synced from manage_server.")

    def _start_sync(self):
        t = threading.Thread(target=self._sync_loop, daemon=True)
        t.start()
        print(f"policy engine: Background sync started (every {self.sync_interval}s).")

    @staticmethod
    def _matches(pattern: str, domain: str) -> bool:
        """Match exact domain or any subdomain, preventing suffix spoofing."""
        return domain == pattern or domain.endswith('.' + pattern)

    # evaluation handler
    def evaluate(self, domain: str) -> str:
        # evaluates where to route the traffic
        with self._lock:
            rules = self.rules

        blocked = rules.get("blocked_domains", [])
        tunnel  = rules.get("tunnel_domains", [])
        default = rules.get("default_action", "DIRECT").upper()

        if any(self._matches(b, domain) for b in blocked):
            return "BLOCK"
        if any(self._matches(t, domain) for t in tunnel):
            return "TUNNEL"
        if default in ("TUNNEL", "BLOCK", "DIRECT"):
            return default
        return "DIRECT"

    def reload(self):
        # no-op now that we don't use local files
        pass


# self test
if __name__ == "__main__":
    engine = PolicyEngine()
    test_domains = ["google.com", "facebook.com", "ynet.co.il", "youtube.com"]
    for d in test_domains:
        print(f"  {d:25s} → {engine.evaluate(d)}")