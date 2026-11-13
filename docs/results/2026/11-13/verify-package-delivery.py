"""Retained-data audit only: no package install/import, browser or model call."""
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
SOURCE = "eec0ba83099607244599315761e9cba4b1c3518e"
QUALIFIED = "ff7fdd20424d6582eedc8713f1ca7a382acce5aa"
sha = lambda raw: hashlib.sha256(raw).hexdigest()
expected = [
    ("pack", "43413669599", "06aa65277c5662dd2ea939a4a500ca55e1586402536374141ebe88b303ed1071", "06766ab5c9909ec1e453b5f2f2fe052c4d984cbc5de4c88a7937510ffe1f66ca", "0eeeffa305efcbe00e06479ad37816c2ab724537663e46180bbc4f826a1c13dc", 3),
    ("public", "43414350393", "c9f3bc05864ac11bfb1cb61b2c5106651abe26f4edda05e45be6dc9642a52d04", "c1d43bf61944956c7a333d86974c4d58f92a76737d002dd383ff8ab05e3953ea", "82b98a6ccc45a655cea059959c35d1fdc43d277ecf8d5b433f19236bdf9ab059", 4),
]
reports, summary = [], []
for phase, run, zip_sha, raw_sha, log_sha, commands in expected:
    raw = (HERE / ("package-" + phase + "-original.json")).read_bytes()
    archive_path = HERE / ("package-" + phase + "-original.zip")
    assert sha(raw) == raw_sha and sha(archive_path.read_bytes()) == zip_sha
    with zipfile.ZipFile(archive_path) as bundle:
        assert bundle.namelist() == ["traverse-package-" + run + ".json"] and bundle.read(bundle.namelist()[0]) == raw
    r = json.loads(raw)
    assert r["accepted"] and r["exitCode"] == 0 and r["phase"] == phase and r["sourceCommit"] == SOURCE and r["qualifiedSource"] == QUALIFIED
    assert len(r["commands"]) == commands and len(r["sourceFiles"]) == 81
    tree = {}
    for item in subprocess.check_output(["git", "ls-tree", "-rz", SOURCE], cwd=ROOT).split(b"\0"):
        if item:
            meta, name = item.split(b"\t", 1)
            mode, kind, blob = meta.decode().split()
            assert kind == "blob"
            tree[name.decode()] = (mode, blob)
    assert set(tree) == set(r["sourceFiles"])
    for name, row in r["sourceFiles"].items():
        body = subprocess.check_output(["git", "cat-file", "blob", row["blob"]], cwd=ROOT)
        assert (row["mode"], row["blob"]) == tree[name] and len(body) == row["bytes"] and sha(body) == row["sha256"]
    decoded = []
    for command in r["commands"]:
        assert command["exitCode"] == 0 and command["reaped"] and command["groupAbsent"] and not command.get("timedOut")
        channels = {}
        for key in ("stdout", "stderr"):
            row = command[key]
            body = gzip.decompress(base64.b64decode(row["gzipBase64"], validate=True))
            assert row["complete"] and len(body) == row["bytes"] and sha(body) == row["sha256"]
            channels[key] = body
        decoded.append(channels)
    assert len(r["sourceGuards"]) == 4 and all(g["matches"] and g["files"] == 81 for g in r["sourceGuards"])
    c = r["cleanup"]
    assert c["rootAbsent"] and len(c["directGroups"]) == commands and all(g["reaped"] and g["absent"] for g in c["directGroups"])
    assert c["fileCount"] == len(c["files"]) and c["bytes"] == sum(x["bytes"] for x in c["files"].values())
    log = json.loads((HERE / ("package-" + phase + "-log.json")).read_bytes())["text"]
    assert sha(log.encode()) == log_sha
    retire = [json.loads(line[line.index('{'):]) for line in log.splitlines() if '"kind": "uploaded-proof-retired"' in line]
    assert len(retire) == 1 and retire[0]["sha256"] == raw_sha and retire[0]["bytes"] == len(raw) and retire[0]["absent"]
    summary.append({"phase": phase, "runId": run, "commands": commands, "completeStreams": commands * 2, "sourceGuards": 4,
                    "ownedFiles": c["fileCount"], "ownedBytes": c["bytes"], "rootAbsent": True, "uploadedProofRemoved": True})
    if phase == "public":
        assert json.loads(decoded[-1]["stdout"]) == r["publicImport"]
    reports.append(r)

pack, public = reports
assert pack["archive"] == public["archive"] and pack["sourceFiles"] == public["sourceFiles"]
payload = base64.b64decode(pack["archive"]["base64"], validate=True)
assert len(payload) == 29478 and sha(payload) == "b79d9259d6fd40cf0a18fc185ba449be459fe8803d2700822f0440f240e48ebb"
assert payload == (HERE / pack["archive"]["name"]).read_bytes()
members = {}
with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as bundle:
    for item in bundle:
        assert item.isfile() and item.name.startswith("package/")
        name = item.name.removeprefix("package/")
        assert name not in members
        body = bundle.extractfile(item).read()
        source = subprocess.check_output(["git", "show", QUALIFIED + ":" + name], cwd=ROOT)
        assert body == source
        members[name] = {"bytes": len(body), "sha256": sha(body)}
assert len(members) == 24 and members == pack["archive"]["files"] == public["installedFiles"]
for name, row in members.items():
    assert pack["cleanup"]["files"]["source/" + name] == row
    assert public["cleanup"]["files"]["consumer/node_modules/@alvarovillalbaa/traverse/" + name] == row
assert public["anonymousDownload"] == {"url": "https://github.com/alvarovillalbaa/traverse/releases/download/v0.2.0-candidate.1/" + pack["archive"]["name"],
                                       "status": 200, "authorizationSent": False, "bodyEOFObserved": True, "responseClosed": True}
assert public["publicImport"]["functions"] == 6 and len(public["publicImport"]["installedExports"]) == 4
publication = json.loads((HERE / "package-publication.json").read_bytes())
assert publication["release"]["source"] == QUALIFIED and publication["release"]["id"] == 444126553
for asset in publication["release"]["assets"]:
    body = (HERE / asset["name"]).read_bytes()
    assert len(body) == asset["size"] and "sha256:" + sha(body) == asset["digest"]
assert publication["nativeCliFailure"]["exitCode"] == 1 and publication["legacyRuntimeCasesReexecuted"] == 0
assert all(c["state"] == "disabled_manually" and c["refAbsent"] for k, c in publication["controls"].items() if isinstance(c, dict))
print(json.dumps({"schemaVersion": 1, "kind": "traverse.package-delivery-data-audit", "passed": True, "dataOnly": True,
    "verifierSha256": sha(Path(__file__).read_bytes()), "packageOrModelReexecuted": False, "archiveBytes": len(payload), "archiveSha256": sha(payload),
    "exactQualifiedMembers": 24, "installedEntryPoints": 4, "completeStreams": 14, "sourceGuards": 8, "phases": summary,
    "limits": ["Retained-data arithmetic/hash audit, not a fresh consumer or independent host attestation.",
               "Prior runtime/browser evidence stays at its own sources; no live inference quality, npm registry or full-portfolio acceptance.",
               "Direct process groups/root/proof retirement do not establish every detached child or whole-host disposal."]}, indent=2))
