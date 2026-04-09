
import json
import os
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
        rules_path: str = "rules.json",
        api_url: str | None = None,
        api_token: str | None = None,
        sync_interval: int = 60,
    ):
        self.rules_path    = rules_path
        self.api_url       = api_url or os.environ.get("MANAGE_SERVER_URL", "http://127.0.0.1:3001")
        self.api_token     = api_token or os.environ.get("PROXY_API_TOKEN", "")
        self.sync_interval = sync_interval
        self._lock         = threading.Lock()
        self.rules         = self._load_rules()

        # background sync if u have a json token
        if self.api_token and _HTTP_AVAILABLE:
            self._start_sync()

    # load rules from files
    def _load_rules(self) -> dict:
        # load from local rule file
        if not os.path.exists(self.rules_path):
            return {"blocked_domains": [], "tunnel_domains": [], "default_action": "DIRECT"}
        try:
            with open(self.rules_path, "r") as f:
                return json.load(f)
        except Exception:
            return {"blocked_domains": [], "tunnel_domains": [], "default_action": "DIRECT"}

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
                os._exit(1)
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
                    try:
                        with open(self.rules_path, "w") as f:
                            json.dump(remote, f, indent=2)
                    except Exception:
                        pass
                print("policy engine: Rules synced from manage_server.")

    def _start_sync(self):
        t = threading.Thread(target=self._sync_loop, daemon=True)
        t.start()
        print(f"policy engine: Background sync started (every {self.sync_interval}s).")

    # evaluation handler
    def evaluate(self, domain: str) -> str:
        # evaluates where to route the traffic
        with self._lock:
            rules = self.rules

        blocked = rules.get("blocked_domains", [])
        tunnel  = rules.get("tunnel_domains", [])
        default = rules.get("default_action", "DIRECT").upper()

        # if domain is in blocked list
        if any(b in domain for b in blocked):
            return "BLOCK"
        # check tunnel list
        if any(t in domain for t in tunnel):
            return "TUNNEL"
        # revert to default
        if default in ("TUNNEL", "BLOCK", "DIRECT"):
            return default
        return "DIRECT"

    def reload(self):
        # reload rules
        with self._lock:
            self.rules = self._load_rules()


# self test
if __name__ == "__main__":
    engine = PolicyEngine(
        os.path.join(os.path.dirname(__file__), "rules.json")
    )
    test_domains = ["google.com", "facebook.com", "ynet.co.il", "youtube.com"]
    for d in test_domains:
        print(f"  {d:25s} → {engine.evaluate(d)}")