"""
Gera assets/stats.svg e assets/languages.svg com dados de TODOS os repos
(incluindo privados), via GitHub GraphQL API.

Requer um token em GH_TOKEN (ou STATS_TOKEN) com acesso de leitura aos
repositórios privados (escopo `repo` ou fine-grained read).

Uso: GH_TOKEN=... python scripts/gen_stats.py
"""

import os
import sys
import json
import hashlib
import urllib.request

TOKEN = os.getenv("GH_TOKEN") or os.getenv("STATS_TOKEN")
USER = os.getenv("STATS_USER", "douglascshun")

BG, BORDER, TITLE, LABEL, VALUE = "#0d1117", "#1987F0", "#1987F0", "#c9d1d9", "#ffffff"
FONT = "font-family='Segoe UI,Helvetica,Arial,sans-serif'"

QUERY = """
query($login:String!){
  user(login:$login){
    name
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    repositoriesContributedTo(contributionTypes:[COMMIT,PULL_REQUEST,ISSUE,PULL_REQUEST_REVIEW]){ totalCount }
    contributionsCollection { totalCommitContributions }
    repositories(first:100, ownerAffiliations:OWNER, isFork:false){
      nodes{
        stargazerCount
        languages(first:15, orderBy:{field:SIZE, direction:DESC}){
          edges{ size node{ name color } }
        }
      }
    }
  }
}
"""

OCT = {
    "star": "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z",
    "clock": "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z",
    "pr": "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
    "issue": "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
    "person": "M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.622 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
}


def fmt(n):
    return f"{n/1000:.1f}k".replace(".0k", "k") if n >= 1000 else str(n)


def fetch():
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=json.dumps({"query": QUERY, "variables": {"login": USER}}).encode(),
        headers={"Authorization": f"bearer {TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["data"]["user"]


def build_stats(u):
    stars = sum(n["stargazerCount"] for n in u["repositories"]["nodes"])
    rows = [
        ("star", "Total de Estrelas", fmt(stars)),
        ("clock", "Total de Commits (último ano)", fmt(u["contributionsCollection"]["totalCommitContributions"])),
        ("pr", "Total de Pull Requests", fmt(u["pullRequests"]["totalCount"])),
        ("issue", "Total de Issues", fmt(u["issues"]["totalCount"])),
        ("person", "Contribuiu para", fmt(u["repositoriesContributedTo"]["totalCount"])),
    ]
    W, H = 495, 200
    s = [f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">',
         f'<rect x="0.5" y="0.5" rx="6" width="{W-1}" height="{H-1}" fill="{BG}" stroke="{BORDER}"/>',
         f'<text x="25" y="35" {FONT} font-size="18" font-weight="700" fill="{TITLE}">Douglas Cshunderlick — GitHub Stats</text>']
    y = 72
    for k, label, val in rows:
        s.append(f'<path transform="translate(25,{y-12})" fill="{TITLE}" d="{OCT[k]}"/>')
        s.append(f'<text x="52" y="{y}" {FONT} font-size="15" fill="{LABEL}">{label}:</text>')
        s.append(f'<text x="468" y="{y}" text-anchor="end" {FONT} font-size="15" font-weight="700" fill="{VALUE}">{val}</text>')
        y += 25
    s.append("</svg>")
    return "\n".join(s)


def build_langs(u):
    agg, colors = {}, {}
    for n in u["repositories"]["nodes"]:
        for e in n["languages"]["edges"]:
            nm = e["node"]["name"]
            agg[nm] = agg.get(nm, 0) + e["size"]
            colors[nm] = e["node"]["color"] or "#888"
    top = sorted(agg.items(), key=lambda x: -x[1])[:6]
    total = sum(v for _, v in top) or 1
    W, H = 360, 200
    bx, bw, by = 25, 310, 68
    s = [f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">',
         f'<rect x="0.5" y="0.5" rx="6" width="{W-1}" height="{H-1}" fill="{BG}" stroke="{BORDER}"/>',
         f'<text x="25" y="35" {FONT} font-size="18" font-weight="700" fill="{TITLE}">Linguagens Mais Usadas</text>',
         f'<rect x="{bx}" y="{by}" rx="5" width="{bw}" height="10" fill="#21262d"/>']
    x = bx
    for nm, v in top:
        w = bw * v / total
        s.append(f'<rect x="{x:.1f}" y="{by}" width="{max(w,1):.1f}" height="10" fill="{colors[nm]}"/>')
        x += w
    ly = 108
    for i, (nm, v) in enumerate(top):
        cx = 25 + (i % 2) * 168
        cy = ly + (i // 2) * 30
        s.append(f'<circle cx="{cx+5}" cy="{cy-4}" r="5" fill="{colors[nm]}"/>')
        s.append(f'<text x="{cx+18}" y="{cy}" {FONT} font-size="13" fill="{LABEL}">{nm} {100*v/total:.1f}%</text>')
    s.append("</svg>")
    return "\n".join(s)


def main():
    if not TOKEN:
        print("❌ Defina GH_TOKEN (ou STATS_TOKEN) com acesso de leitura aos repos.")
        sys.exit(1)
    u = fetch()
    os.makedirs("assets", exist_ok=True)
    open("assets/stats.svg", "w", encoding="utf-8").write(build_stats(u))
    open("assets/languages.svg", "w", encoding="utf-8").write(build_langs(u))
    print("✅ assets/stats.svg e assets/languages.svg atualizados.")


if __name__ == "__main__":
    main()
