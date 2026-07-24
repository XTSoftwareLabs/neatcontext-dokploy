# NeatContext for Dokploy

A ready-to-connect [NeatContext](https://docs.neatcontext.com) Team Library for
investigating [Dokploy](https://github.com/Dokploy/dokploy) issues.
It is an investigation aid, not an upstream fix or a replacement for Dokploy
support.

It combines:

- a shared Dokploy investigation profile;
- curated public Dokploy knowledge and a version-aware investigation playbook;
- a Git-ignored place for each user’s private symptoms, logs, and evidence.

The public material and your private case folder are selected into one
NeatContext Context. Nothing under `private/` is part of the Team Library or
intended for Git.

## Use it

### 1. Clone this library

```shell
git clone https://github.com/XTSoftwareLabs/neatcontext-dokploy.git
cd neatcontext-dokploy
```

### 2. Create a private case

Create a folder for the case:

```text
private/cases/<your-case-name>
```

Then copy [`templates/private-case.md`](templates/private-case.md) into that
folder as:

```text
private/cases/<your-case-name>/case.md
```

Fill in `case.md` as best you can. Unknown or irrelevant fields can stay blank.
Paste only the smallest useful redacted log or error excerpts into that same
file. Git ignores everything under `private/`.

### 3. Connect the public Team Library

In NeatContext:

1. Open **Library**.
2. Click **Connect team library**.
3. Select this repository’s root folder (the folder containing `library.json`).

NeatContext will discover:

- **Dokploy Issue Investigation** under Domain profiles;
- **dokploy** under Knowledge folders.

### 4. Link only your private case

In **Library → Knowledge folders**, click **Add folder** and select:

```text
private/cases/<your-case-name>
```

Link the individual case folder, not all of `private/`, so evidence from old
incidents cannot leak into the current investigation.

### 5. Build the Context

1. Open **Contexts** and create a Context such as `Dokploy investigation`.
2. Under **Domain profiles**, add **Dokploy Issue Investigation** and make it
   active.
3. Under **Knowledge folders**, add both **dokploy** and your private case.
4. Connect your preferred AI client.

### 6. Ask the investigation question

```text
Use the active Dokploy profile to investigate this issue. Search both attached
knowledge folders. Start by checking whether the evidence is sufficient, then
report confirmed facts, hypotheses, contradictions, unknowns, and the safest
next evidence to collect. Do not treat a similar public issue as proof of my
root cause, and do not recommend a state change until I approve it.
```

That is the complete setup. Pull the repository later to refresh the shared
profile and public knowledge; your ignored `private/` cases remain untouched.

## Important privacy note

`.gitignore` prevents normal Git commits of `private/` material, but it is not
encryption or a data-loss-prevention system. Redact credentials, tokens,
cookies, private keys, webhook secrets, personal data, and unnecessary
hostnames/IPs before saving evidence. A connected AI client can read the folders
you attach and processes them under that client’s own privacy policy.

## What is included

```text
library.json                 NeatContext Team Library marker
profiles/                    Shared Dokploy domain profile
knowledge/dokploy/           Shared public investigation knowledge
templates/private-case.md    Single-file local-case template
private/                     Ignored user evidence (never Team Library content)
extensions/                  Reserved for future read-only extensions
```

See [DESIGN.md](DESIGN.md) for the trust boundaries and maintenance model.
Run `npm test` to validate the Team Library structure.

## Reference case

The public knowledge includes a bounded case study of
[Dokploy issue #4898](https://github.com/Dokploy/dokploy/issues/4898). It is a
retrieval aid and worked example, not a diagnosis for unrelated installations.
