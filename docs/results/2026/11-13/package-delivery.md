# Traverse 0.2.0 candidate delivered

The [public GitHub prerelease](https://github.com/alvarovillalbaa/traverse/releases/tag/v0.2.0-candidate.1)
now provides the exact previously qualified package, checksums and member
manifest. A fresh anonymous download, offline installation and imports of all
four entry points passed. This closes the [package-delivery packet](../../../proposals/package-candidate.md).

Install into an existing Node 24+ test project:

```sh
npm install --ignore-scripts https://github.com/alvarovillalbaa/traverse/releases/download/v0.2.0-candidate.1/alvarovillalbaa-traverse-0.2.0.tgz
```

The tarball has 24 files and is 29,478 bytes, SHA-256
`b79d9259d6fd40cf0a18fc185ba449be459fe8803d2700822f0440f240e48ebb`.
Every member matches its actual qualified source at
`ff7fdd20424d6582eedc8713f1ca7a382acce5aa`; the public tag points there too.
Its README/acceptance documents preserve that build-time snapshot. Current
[runtime acceptance](../11-12/openai-checks.md) and these release notes describe
later outcomes without changing the accepted archive. No existing tag, release
or asset was replaced. Release444126553 has three uploaded assets with matching
server sizes/digests; [publication receipt](package-publication.json).

| Phase | Actual result |
| --- | --- |
| [Pack run43413669599/job131846106238](https://github.com/alvarovillalbaa/traverse/actions/runs/43413669599/job/131846106238) | Exported only the 24 historical qualified members, packed offline without scripts, and reproduced the exact old tarball. Three commands/six original streams, four source guards, owned 562-file/1,538,039-byte scratch removal and uploaded-proof removal passed. |
| [Public run43414350393/job131848356364](https://github.com/alvarovillalbaa/traverse/actions/runs/43414350393/job/131848356364) | Anonymous HTTPS200 body/EOF/hash matched; offline no-script installation retained all24 exact files. Root, Playwright, Vitest and OpenAI imports exposed six expected functions. Four commands/eight streams, four guards, owned584-file/1,560,043-byte scratch removal and uploaded-proof removal passed. |

Both phases used Node24.21.0/npm11.19.0 and source
`eec0ba83099607244599315761e9cba4b1c3518e`, 81 files/669,208 bytes. Activation
commits9cb7ba61 and850eac80 each added only their named workflow. Current native
and remote histories initially had the same eab8a9bf tree under different IDs;
an ordinary clean merge preserved both without changing their files.

Original pack [JSON](package-pack-original.json), [ZIP](package-pack-original.zip)
and [lossless job log](package-pack-log.json), plus public
[JSON](package-public-original.json), [ZIP](package-public-original.zip) and
[log](package-public-log.json), remain unchanged. The
[data-only verifier](verify-package-delivery.py) and [audit](package-delivery-audit.json)
verify complete Git vectors, 14 original streams/eight guards, archive/member/
installed bytes, command outcomes and proof retirement from those originals.
They do not rerun a package, browser or model. Both temporary workflows are
disabled/read back; both exact SHA-verified QA refs were deleted/read back empty.

The first native release CLI command failed to connect. Public and authenticated
readbacks both found no release. The existing GitHub API CLI then created one
draft, uploaded/verified all three assets, and published that reviewed draft
once. The failed command and reconciliation remain in the publication receipt;
no permission failure or ambiguous write was retried blindly.

The earlier 45 core/17 installed contracts and optional executor's26 unit/two
Chromium/type checks stay closed at their own sources. No legacy test was rerun
and no real model called. Runtime/package/version/dependency/lock/prompt bytes
stay unchanged. This is GitHub package delivery, not npm registry publication,
new inference-quality evidence or full-portfolio completion. Direct process
group/root/proof cleanup does not attest every detached child or whole-host
disposal. Local Storage Guard2.2/34GiB failed; no local pack/install/runtime/
browser/build, account, database, hosted service or paid resource was created.
