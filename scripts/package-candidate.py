"""Two bounded public CI phases: exact qualified packing, then public installation."""
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import traceback
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, build_opener

REPO = "alvarovillalbaa/traverse"
QUALIFIED = "ff7fdd20424d6582eedc8713f1ca7a382acce5aa"
ARCHIVE = "alvarovillalbaa-traverse-0.2.0.tgz"
ARCHIVE_SHA = "b79d9259d6fd40cf0a18fc185ba449be459fe8803d2700822f0440f240e48ebb"
ARCHIVE_BYTES = 29478
URL = "https://github.com/" + REPO + "/releases/download/v0.2.0-candidate.1/" + ARCHIVE
ROOT = Path.cwd()
PHASE = os.environ.get("TRAVERSE_PHASE", "")
RUN = os.environ.get("GITHUB_RUN_ID", "")
SOURCE = os.environ.get("SOURCE_COMMIT", "")
proof = Path(os.environ.get("RUNNER_TEMP", "/invalid")) / ("traverse-package-" + RUN + ".json")
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def need(value, label):
    if not value:
        raise RuntimeError(label)


def admission():
    need(os.environ.get("CI") == "true" and os.environ.get("GITHUB_REPOSITORY") == REPO and PHASE in ("pack", "public") and RUN.isdigit(), "Exact public CI phase")
    need(os.environ.get("GITHUB_EVENT_NAME") == "create" and os.environ.get("GITHUB_REF") == "refs/heads/qa/traverse-package-20261113-" + PHASE + "-1", "Exact QA branch event")
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_bytes())
    need(event["repository"]["private"] is False and event["ref_type"] == "branch", "Public repository only")
    need(subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == SOURCE, "Exact source checkout")


admission()
if sys.argv[1:] == ["--retire"]:
    st = proof.lstat()
    raw = proof.read_bytes()
    need(proof.is_file() and not proof.is_symlink() and st.st_uid == os.getuid() and st.st_dev == int(os.environ["REPORT_DEV"]) and st.st_ino == int(os.environ["REPORT_INO"]), "Owned proof identity")
    need(sha(raw) == os.environ["REPORT_SHA"] and json.loads(raw)["runId"] == RUN, "Exact uploaded proof bytes")
    proof.unlink()
    need(not proof.exists(), "Proof absence")
    print(json.dumps({"kind": "uploaded-proof-retired", "sha256": sha(raw), "bytes": len(raw), "absent": True}))
    sys.exit(0)
need(sys.argv[1:] == [], "No extra mode")

report = {"schemaVersion": 1, "kind": "traverse.package-candidate", "phase": PHASE, "runId": RUN,
          "sourceCommit": SOURCE, "qualifiedSource": QUALIFIED, "commands": [], "sourceGuards": [], "checks": {}, "cleanup": {}}
scratch = None
leaders = []
deadline = time.monotonic() + 360
status = 1


def capture(body):
    need(len(body) <= 1024 * 1024, "Original stream bound")
    return {"bytes": len(body), "sha256": sha(body), "gzipBase64": base64.b64encode(gzip.compress(body, mtime=0)).decode(), "complete": True}


def vector():
    rows = {}
    for entry in subprocess.check_output(["git", "ls-tree", "-rz", "HEAD"]).split(b"\0"):
        if entry:
            meta, name = entry.split(b"\t", 1)
            mode, kind, blob = meta.decode().split()
            need(kind == "blob", "Source leaf type")
            path = ROOT / name.decode()
            body = path.read_bytes()
            need(not path.is_symlink() and subprocess.check_output(["git", "cat-file", "blob", blob]) == body, "Exact source bytes")
            rows[name.decode()] = {"mode": mode, "blob": blob, "bytes": len(body), "sha256": sha(body)}
    need(subprocess.check_output(["git", "status", "--porcelain"]) == b"", "Clean source and index")
    return rows


def guard(label):
    need(vector() == source_vector, "Source changed")
    report["sourceGuards"].append({"label": label, "files": len(source_vector), "matches": True})


def group_live(pid):
    try:
        os.killpg(pid, 0)
        return True
    except ProcessLookupError:
        return False


def run(argv, cwd):
    need(time.monotonic() < deadline and shutil.disk_usage(scratch).free > 2 * 1024**3, "Time/storage boundary")
    index = len(report["commands"])
    row = {"argv": argv, "startedAt": time.time()}
    report["commands"].append(row)
    out, err = scratch / (str(index) + ".out"), scratch / (str(index) + ".err")
    with out.open("xb") as stdout, err.open("xb") as stderr:
        child = subprocess.Popen(argv, cwd=cwd, env=environment, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, start_new_session=True)
        leaders.append(child)
        row["pid"] = child.pid
        try:
            child.wait(timeout=min(90, max(.1, deadline - time.monotonic())))
        except subprocess.TimeoutExpired:
            row["timedOut"] = True
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=5)
    row.update({"exitCode": child.returncode, "reaped": child.poll() is not None, "groupAbsent": not group_live(child.pid),
                "stdout": capture(out.read_bytes()), "stderr": capture(err.read_bytes())})
    need(row["exitCode"] == 0 and row["reaped"] and row["groupAbsent"] and not row.get("timedOut"), "Actual command failed")
    return out.read_bytes()


def manifest(directory):
    result = {}
    for path in sorted(directory.rglob("*")):
        need(not path.is_symlink(), "No consumer/source symlinks")
        if path.is_file():
            body = path.read_bytes()
            result[str(path.relative_to(directory))] = {"bytes": len(body), "sha256": sha(body)}
    return result


try:
    need(shutil.disk_usage(os.environ["RUNNER_TEMP"]).free > 8 * 1024**3, "External runner storage admission")
    source_vector = vector()
    report["sourceFiles"] = source_vector
    qualification = json.loads((ROOT / "docs/results/2026/11-12/openai-checks.json").read_bytes())
    need(qualification["source"]["githubCommit"] == QUALIFIED and qualification["package"]["sha256"] == ARCHIVE_SHA, "Original qualification binding")
    expected = {row["path"]: {key: row[key] for key in ("bytes", "sha256")} for row in qualification["package"]["files"]}
    need(len(expected) == 24, "Exact qualified package set")
    scratch = Path(tempfile.mkdtemp(prefix="traverse-package-", dir=os.environ["RUNNER_TEMP"]))
    os.chmod(scratch, 0o700)
    identity = (scratch.stat().st_dev, scratch.stat().st_ino, scratch.stat().st_uid)
    nonce = secrets.token_hex(16)
    (scratch / ".owner").write_text(nonce)
    report["ownedRoot"] = {"path": str(scratch), "identity": list(identity), "nonce": nonce}
    for name in ("cache", "config", "temp", "source", "consumer"):
        (scratch / name).mkdir(mode=0o700)
    for name in ("npmrc", "npm-global"):
        (scratch / name).write_text("")
    environment = {key: os.environ[key] for key in ("PATH", "HOME", "RUNNER_TEMP")}
    environment.update({"CI": "true", "NO_COLOR": "1", "TMPDIR": str(scratch / "temp"), "XDG_CACHE_HOME": str(scratch / "cache"), "XDG_CONFIG_HOME": str(scratch / "config"),
                        "npm_config_cache": str(scratch / "cache/npm"), "npm_config_userconfig": str(scratch / "npmrc"), "npm_config_globalconfig": str(scratch / "npm-global"),
                        "npm_config_update_notifier": "false", "npm_config_fetch_retries": "0"})
    node, npm = shutil.which("node"), shutil.which("npm")
    report["node"] = run([node, "--version"], scratch).decode().strip()
    report["npm"] = run([npm, "--version"], scratch).decode().strip()
    need(report["node"] == "v24.21.0", "Pinned Node profile")
    guard("before-package")
    archive = scratch / ARCHIVE
    if PHASE == "pack":
        for name, row in expected.items():
            need(not PurePosixPath(name).is_absolute() and ".." not in PurePosixPath(name).parts, "Qualified path safety")
            body = subprocess.check_output(["git", "show", QUALIFIED + ":" + name])
            need(len(body) == row["bytes"] and sha(body) == row["sha256"], "Exact historical qualified member")
            target = scratch / "source" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)
        packed = json.loads(run([npm, "pack", "--ignore-scripts", "--json", "--offline", "--pack-destination", str(scratch)], scratch / "source"))
        need(len(packed) == 1 and packed[0]["filename"] == ARCHIVE, "Single exact package")
    else:
        # No Auth header, proxy, credential discovery or implicit registry query.
        with build_opener(ProxyHandler({})).open(URL, timeout=30) as response:
            need(response.status == 200 and urlsplit(response.geturl()).scheme == "https" and urlsplit(response.geturl()).hostname in ("github.com", "release-assets.githubusercontent.com"), "Anonymous release response")
            body = response.read(ARCHIVE_BYTES + 1)
            need(response.read(1) == b"", "Complete anonymous body")
        archive.write_bytes(body)
        report["anonymousDownload"] = {"url": URL, "status": 200, "authorizationSent": False, "bodyEOFObserved": True, "responseClosed": True}
    body = archive.read_bytes()
    need(len(body) == ARCHIVE_BYTES and sha(body) == ARCHIVE_SHA, "Byte-exact previously qualified tarball")
    actual = {}
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle:
            need(member.isfile() and member.name.startswith("package/") and ".." not in PurePosixPath(member.name).parts and member.size <= 128 * 1024, "Bounded archive file")
            name = member.name.removeprefix("package/")
            need(name not in actual, "No duplicate archive member")
            content = bundle.extractfile(member).read()
            actual[name] = {"bytes": len(content), "sha256": sha(content)}
    need(actual == expected, "24 exact qualified archive members")
    report["archive"] = {"name": ARCHIVE, "bytes": len(body), "sha256": sha(body), "files": actual, "base64": base64.b64encode(body).decode()}
    report["checks"]["exactQualifiedArchive"] = True
    if PHASE == "public":
        consumer = scratch / "consumer"
        (consumer / "package.json").write_text('{"name":"authored-traverse-public-consumer","version":"0.0.0","private":true,"type":"module"}\n')
        run([npm, "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=peer", str(archive)], consumer)
        installed = consumer / "node_modules/@alvarovillalbaa/traverse"
        need(manifest(installed) == expected, "24 exact installed public members")
        imports = """import assert from 'node:assert/strict';
const names=['@alvarovillalbaa/traverse','@alvarovillalbaa/traverse/playwright','@alvarovillalbaa/traverse/vitest','@alvarovillalbaa/traverse/openai'];
const modules=await Promise.all(names.map(name=>import(name)));
for(const [index,key] of [[0,'openSession'],[0,'createMemoryReplayStore'],[0,'TraverseError'],[1,'createPlaywrightDriver'],[2,'createUiFixture'],[3,'createOpenAIExecutor']])assert.equal(typeof modules[index][key],'function');
console.log(JSON.stringify({installedExports:names,functions:6,modelCalls:0,browserLaunches:0}));
"""
        report["publicImport"] = json.loads(run([node, "--input-type=module", "-e", imports], consumer))
        report["checks"]["anonymousFreshInstallation"] = True
        report["checks"]["fourInstalledExports"] = True
        report["installedFiles"] = manifest(installed)
    guard("after-package")
    status = 0
except BaseException as error:
    report["failure"] = {"type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
finally:
    if scratch is not None:
        try:
            need(all(p.poll() is not None and not group_live(p.pid) for p in leaders), "Owned command group remains; preserve scratch")
            guard("after-command-shutdown")
            need((scratch.stat().st_dev, scratch.stat().st_ino, scratch.stat().st_uid) == identity and (scratch / ".owner").read_text() == nonce, "Owned scratch identity")
            leaves = manifest(scratch)
            need(len(leaves) <= 5000 and sum(r["bytes"] for r in leaves.values()) < 512 * 1024**2, "Owned scratch bound")
            report["cleanup"] = {"directGroups": [{"pid": p.pid, "reaped": True, "absent": True} for p in leaders], "files": leaves, "fileCount": len(leaves),
                                 "bytes": sum(r["bytes"] for r in leaves.values()), "scope": "Direct process groups only; not every detached descendant or whole-host attestation"}
            shutil.rmtree(scratch)
            need(not scratch.exists(), "Owned root absent")
            report["cleanup"]["rootAbsent"] = True
            guard("after-root-removal")
        except BaseException:
            report["cleanup"]["failure"] = traceback.format_exc()
            status = 1
    report["exitCode"] = status
    report["accepted"] = status == 0 and report["cleanup"].get("rootAbsent") is True
    raw = json.dumps(report, separators=(",", ":")).encode() + b"\n"
    need(len(raw) < 4 * 1024**2 and not proof.exists(), "Bounded new proof path")
    with proof.open("xb") as output:
        output.write(raw)
    st = proof.stat()
    with Path(os.environ["GITHUB_OUTPUT"]).open("a") as output:
        output.write(f"report_sha={sha(raw)}\nreport_dev={st.st_dev}\nreport_ino={st.st_ino}\n")
    print(json.dumps({"kind": "package-proof", "sha256": sha(raw), "bytes": len(raw), "accepted": report["accepted"]}))
sys.exit(status)
