# セキュリティについて / Security Policy

## 日本語

### 対応している版
最新版だけを直します。古い版を使っている場合は、まず最新版に上げてください。

### 脆弱性の報告
**公開の issue には書かないでください。** GitHub の非公開の報告を使ってください。

1. このリポジトリの **Security** タブを開く
2. **Report a vulnerability** を押す（直接開く: https://github.com/roi-roi61/debug-legend/security/advisories/new ）
3. 次のことを書く
   - 版（`/dl-version` で分かります）
   - 起きること、再現の手順
   - 考えられる影響（何が読める・書ける・送られるか）

報告の中身は、直すまで公開しません。直したあとで、報告してくれた方の名前を載せてよいか確認します。

### 対象
- `mod/` の中のコード（Claude Code の mod 本体）
- `.claude-plugin/` の配布の設定

mod の約束は README の「プライバシー」の通りです。プロンプトや作業の内容を外部に送らない、セーブはこのパソコンの中だけ、X へのポストはリンクを開くだけ。これを破る動きは、すべて脆弱性として扱います。

## English

### Supported versions
Only the latest version gets fixes. If you are on an older version, update first.

### Reporting a vulnerability
**Please do not open a public issue.** Use GitHub's private reporting instead.

1. Open the **Security** tab of this repository
2. Click **Report a vulnerability** (direct link: https://github.com/roi-roi61/debug-legend/security/advisories/new )
3. Include
   - the version (shown by `/dl-version`)
   - what happens and how to reproduce it
   - the possible impact (what can be read, written or sent)

Reports stay private until a fix is out. After the fix, we will ask whether you would like to be credited.

### Scope
- the code in `mod/` (the Claude Code mod itself)
- the distribution settings in `.claude-plugin/`

The mod's promises are the ones in the README's "Privacy" section: your prompts and work are never sent anywhere, your save stays on your computer, and posting on X only opens a link. Anything that breaks them is treated as a vulnerability.
