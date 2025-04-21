import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  /* ------------------------------------------------------------------ *
   * 1. 구역별 토큰(<BUGS> 등) 기본 데코레이션                           *
   * ------------------------------------------------------------------ */
  const bugsDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255,0,0,0.20)', borderRadius: '2px'
  });
  const bugeDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(  0,255,0,0.20)', borderRadius: '2px'
  });
  const fixsDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(  0,  0,255,0.20)', borderRadius: '2px'
  });
  const fixeDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(  0,255,0,0.20)', borderRadius: '2px'
  });

  /* ------------------------------------------------------------------ *
   * 2. “원본에 존재하지 않는 키워드” 데코레이션                          *
   * ------------------------------------------------------------------ */
  const devOnlyDecoration  = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(128,  0,128,0.30)'   // purple
  });
  const suggOnlyDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255,192,203,0.30)'   // pink
  });
  const bothDecoration     = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(128,128,128,0.30)'   // gray
  });

  /* ------------------------------------------------------------------ *
   * 3. 텍스트 내 지정한 모든 단어의 Range 찾기                          *
   * ------------------------------------------------------------------ */
  function findRanges(doc: vscode.TextDocument, words: string[]): vscode.Range[] {
    const ranges: vscode.Range[] = [];
    if (!words.length) return ranges;
    const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`\\b(?:${escaped})\\b`, 'g');
    const text = doc.getText();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = doc.positionAt(m.index);
      const end   = doc.positionAt(m.index + m[0].length);
      ranges.push(new vscode.Range(start, end));
    }
    return ranges;
  }

  /* ------------------------------------------------------------------ *
   * 4. 문서 변화 시 하이라이트 갱신                                     *
   * ------------------------------------------------------------------ */
  function updateHighlights(editor: vscode.TextEditor) {
    const doc  = editor.document;
    const text = doc.getText();

    /* 4‑1. 토큰(<BUGS> 등) 하이라이트 */
    const mark = (rgx: RegExp) => {
      const r: vscode.Range[] = [];
      let m: RegExpExecArray | null;
      while ((m = rgx.exec(text))) {
        r.push(new vscode.Range(doc.positionAt(m.index),
                                doc.positionAt(m.index + m[0].length)));
      }
      return r;
    };
    editor.setDecorations(bugsDecoration, mark(/<BUGS>/g));
    editor.setDecorations(bugeDecoration, mark(/<BUGE>/g));
    editor.setDecorations(fixsDecoration, mark(/<FIXS>/g));
    editor.setDecorations(fixeDecoration, mark(/<FIXE>/g));

    /* 4‑2. 세 섹션(원본·제안·정답) 분리 ― “----” · “====” 모두 허용 */
    const lines = text.split(/\r?\n/);
    const isSep = (ln: string) => /^[-=]{4,}$/.test(ln);
    const idx1 = lines.findIndex(isSep);
    const idx2 = lines.findIndex((_, i) => i > idx1 && isSep(lines[i]));
    const idx3 = lines.findIndex((_, i) => i > idx2 && isSep(lines[i]));
    if (idx1 < 0 || idx2 < 0 || idx3 < 0) return;   // 구분선 부족

    const origText  = lines.slice(1,          idx1).join('\n');  // “CWE‑###” 제외
    const suggText  = lines.slice(idx1 + 1,   idx2).join('\n');
    const devText   = lines.slice(idx2 + 1,   idx3).join('\n');

    /* 4‑3. 식별자 수집 */
    const identRe  = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
    const toSet    = (t: string) => new Set(t.match(identRe) || []);
    const origIds  = toSet(origText);
    const suggIds  = toSet(suggText);
    const devIds   = toSet(devText);

    /* 4‑4. 분류 */
    const devOnly  = [...devIds].filter(x => !origIds.has(x) && !suggIds.has(x));
    const suggOnly = [...suggIds].filter(x => !origIds.has(x) && !devIds.has(x));
    const both     = [...devIds].filter(x => !origIds.has(x) &&  suggIds.has(x));

    /* 4‑5. 색칠 */
    editor.setDecorations(devOnlyDecoration,  findRanges(doc, devOnly));
    editor.setDecorations(suggOnlyDecoration, findRanges(doc, suggOnly));
    editor.setDecorations(bothDecoration,     findRanges(doc, both));
  }

  /* ------------------------------------------------------------------ *
   * 5. 편집기 / 문서 이벤트 연결                                        *
   * ------------------------------------------------------------------ */
  if (vscode.window.activeTextEditor)
    updateHighlights(vscode.window.activeTextEditor);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(e => e && updateHighlights(e)),
    vscode.workspace.onDidChangeTextDocument(ev => {
      const ed = vscode.window.activeTextEditor;
      if (ed && ev.document === ed.document) updateHighlights(ed);
    })
  );

  /* ------------------------------------------------------------------ *
   * 6. “Normalize Tokens” 임시 커맨드                                   *
   * ------------------------------------------------------------------ */
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.normalizePatchTokens', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return vscode.window.showErrorMessage('열려 있는 편집기가 없습니다.');
      const txt     = editor.document.getText()
                       .replace(/(<BUGS>|<BUGE>|<FIXS>|<FIXE>)/g, '\n$1\n')
                       .replace(/\n{2,}/g, '\n\n')
                       .trim() + '\n';
      const lang    = editor.document.languageId || 'plaintext';
      const doc     = await vscode.workspace.openTextDocument({ content: txt, language: lang });
      await vscode.window.showTextDocument(doc, { preview: false });
    })
  );
}

export function deactivate() {}

// import * as vscode from 'vscode';

// export function activate(context: vscode.ExtensionContext) {
//   // token decorations (existing)
//   const bugsDecoration = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(255,0,0,0.2)', borderRadius: '2px' });
//   const bugeDecoration = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(0,255,0,0.2)', borderRadius: '2px' });
//   const fixsDecoration = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(0,0,255,0.2)', borderRadius: '2px' });
//   const fixeDecoration = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(0,255,0,0.2)', borderRadius: '2px' });

//   // missing‐keyword decorations
//   const devOnlyDecoration  = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(128,0,128,0.3)' });   // purple
//   const suggOnlyDecoration = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(255,192,203,0.3)' }); // pink
//   const bothDecoration     = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(128,128,128,0.3)' }); // gray

//   function findRanges(doc: vscode.TextDocument, words: string[]): vscode.Range[] {
//     const text = doc.getText();
//     const ranges: vscode.Range[] = [];
//     for (const w of words) {
//       const re = new RegExp(`\\b${w}\\b`, 'g');
//       let m: RegExpExecArray | null;
//       while ((m = re.exec(text))) {
//         const start = doc.positionAt(m.index);
//         const end   = doc.positionAt(m.index + w.length);
//         ranges.push(new vscode.Range(start, end));
//       }
//     }
//     return ranges;
//   }

//   function updateHighlights(editor: vscode.TextEditor) {
//     const doc = editor.document;
//     const text = doc.getText();

//     // 1) highlight tokens as before
//     const bugsRanges: vscode.Range[] = [];
//     const bugeRanges: vscode.Range[] = [];
//     const fixsRanges: vscode.Range[] = [];
//     const fixeRanges: vscode.Range[] = [];
//     let m: RegExpExecArray | null;
//     const addRanges = (re: RegExp, arr: vscode.Range[]) => {
//       while ((m = re.exec(text))) {
//         arr.push(new vscode.Range(
//           doc.positionAt(m.index),
//           doc.positionAt(m.index + m[0].length)
//         ));
//       }
//     };
//     addRanges(/<BUGS>/g, bugsRanges);
//     addRanges(/<BUGE>/g, bugeRanges);
//     addRanges(/<FIXS>/g, fixsRanges);
//     addRanges(/<FIXE>/g, fixeRanges);

//     editor.setDecorations(bugsDecoration, bugsRanges);
//     editor.setDecorations(bugeDecoration, bugeRanges);
//     editor.setDecorations(fixsDecoration, fixsRanges);
//     editor.setDecorations(fixeDecoration, fixeRanges);

//     // 2) split into sections by "----" lines
//     const lines = text.split(/\r?\n/);
//     const isSep = (ln: string) => /^-{4,}$/.test(ln);
//     const idx1 = lines.findIndex(isSep);
//     const idx2 = lines.findIndex((_, i) => i > idx1 && isSep(lines[i]));
//     const idx3 = lines.findIndex((_, i) => i > idx2 && isSep(lines[i]));
//     if (idx1 < 0 || idx2 < 0 || idx3 < 0) {
//       // can't classify keywords if no proper separators
//       return;
//     }

//     const originalText  = lines.slice(1, idx1).join('\n');
//     const suggestionText= lines.slice(idx1 + 1, idx2).join('\n');
//     const developerText = lines.slice(idx2 + 1, idx3).join('\n');

//     // 3) extract identifiers
//     const identRe = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
//     const origIds = new Set(originalText.match(identRe) || []);
//     const suggIds = new Set(suggestionText.match(identRe) || []);
//     const devIds  = new Set(developerText.match(identRe) || []);

//     // 4) classify missing keywords
//     const devOnly  = Array.from(devIds).filter(id => !origIds.has(id) && !suggIds.has(id));
//     const suggOnly = Array.from(suggIds).filter(id => !origIds.has(id) && !devIds.has(id));
//     const both     = Array.from(devIds).filter(id => !origIds.has(id) && suggIds.has(id));

//     // 5) find and decorate ranges
//     const devRanges  = findRanges(doc, devOnly);
//     const suggRanges = findRanges(doc, suggOnly);
//     const bothRanges = findRanges(doc, both);

//     editor.setDecorations(devOnlyDecoration, devRanges);
//     editor.setDecorations(suggOnlyDecoration, suggRanges);
//     editor.setDecorations(bothDecoration,   bothRanges);
//   }

//   // hook into editor events
//   if (vscode.window.activeTextEditor) {
//     updateHighlights(vscode.window.activeTextEditor);
//   }
//   context.subscriptions.push(
//     vscode.window.onDidChangeActiveTextEditor(e => e && updateHighlights(e)),
//     vscode.workspace.onDidChangeTextDocument(ev => {
//       const ed = vscode.window.activeTextEditor;
//       if (ed && ev.document === ed.document) {
//         updateHighlights(ed);
//       }
//     })
//   );

//   // (선택) 3) 줄번호 주석 삽입이나 요약 테이블 추가 등
//   // 필요하다면 CodeLensProvider / TextEditorEdit API를 이용해
//   // 문서 상단에 키워드 요약을 삽입하는 커맨드를 별도 구현할 수 있습니다.

//   // 4) Normalize Tokens 커맨드
//   const normalizeCmd = vscode.commands.registerCommand('extension.normalizePatchTokens', async () => {
//     const editor = vscode.window.activeTextEditor;
//     if (!editor) {
//       return vscode.window.showErrorMessage('열려 있는 편집기가 없습니다.');
//     }

//     const text = editor.document.getText();
//     // 1) 토큰 앞뒤로 줄바꿈 삽입
//     const tokenPattern = /(<BUGS>|<BUGE>|<FIXS>|<FIXE>)/g;
//     let normalized = text.replace(tokenPattern, '\n$1\n');
//     // 2) 연속된 빈 줄은 하나로
//     normalized = normalized.replace(/\n{2,}/g, '\n\n');
//     // 3) 앞뒤 공백 줄 제거
//     normalized = normalized.trim() + '\n';

//     // 새 Untitled 문서로 열기 (원본 언어 유지)
//     const lang = editor.document.languageId || 'plaintext';
//     const doc = await vscode.workspace.openTextDocument({ content: normalized, language: lang });
//     await vscode.window.showTextDocument(doc, { preview: false });
//   });

//   context.subscriptions.push(normalizeCmd);
// }

// export function deactivate() {}

// // import * as vscode from 'vscode';

// // export function activate(context: vscode.ExtensionContext) {
// //     let disposable = vscode.commands.registerCommand('extension.analyzePatchChallenges', () => {
// //         const editor = vscode.window.activeTextEditor;
// //         if (!editor) {
// //             vscode.window.showErrorMessage('활성화된 에디터가 없습니다.');
// //             return;
// //         }
// //         const text = editor.document.getText();
// //         const lines = text.split(/\r?\n/);

// //         // 1) CWE 라인
// //         const cweLine = lines[0].trim();

// //         // 2) 첫/두번째 구분선 위치 찾기
// //         const isSep = (ln: string) => /^-{4,}$/.test(ln);
// //         const isSep2 = (ln: string) => /^={4,}$/.test(ln);
// //         const idx1 = lines.findIndex(isSep);
// //         const idx2 = lines.findIndex((ln, i) => i > idx1 && isSep(ln));
// //         const idx3 = lines.findIndex((ln, i) => i > idx2 && isSep2(ln));

// //         if (idx1 < 0 || idx2 < 0 || idx3 < 0) {
// //             vscode.window.showErrorMessage('본문 내부에 “----” 구분선이 3개 이상 있어야 합니다.\n Debug Message: ' + JSON.stringify({idx1, idx2, idx3}));
// //             return;
// //         }

// //         // 3) 섹션별 추출
// //         const originalCode = lines.slice(1, idx1).join('\n');
// //         const suggestionCode = lines.slice(idx1 + 1, idx2).join('\n');
// //         const developerCode = lines.slice(idx2 + 1, idx3).join('\n');

// //         // 4) <FIXS>…<FIXE> 사이에서 식별자 추출
// //         const extractSnippets = (src: string) => {
// //             const re = /<FIXS>([\s\S]*?)<FIXE>/g;
// //             let m: RegExpExecArray | null;
// //             const out: string[] = [];
// //             while ( (m = re.exec(src)) ) {
// //                 out.push(m[1]);
// //             }
// //             return out.join('\n');
// //         };
// //         const fixSnippets = extractSnippets(suggestionCode)
// //                           + '\n'
// //                           + extractSnippets(developerCode);

// //         // 5) 키워드 식별 (단순식별자)
// //         const idents = new Set<string>();
// //         for (const id of fixSnippets.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || []) {
// //             idents.add(id);
// //         }

// //         // 6) 원본에 없는 것만 필터
// //         interface KW { name: string; exists: boolean; }
// //         const table: KW[] = [];
// //         for (const name of Array.from(idents).sort()) {
// //             const exists = new RegExp(`\\b${name}\\b`).test(originalCode);
// //             if (!exists) {
// //                 table.push({ name, exists });
// //             }
// //         }

// //         // 7) 마크다운 생성
// //         const mdLines: string[] = [];
// //         mdLines.push(`## ${cweLine}\n`);
// //         mdLines.push('## 난제 영역 키워드');
// //         mdLines.push('| 키워드 | 원본존재 | 유형(추정) |');
// //         mdLines.push('|--------|---------|-----------|');
// //         for (const {name} of table) {
// //             // TODO: 유형 판정 로직 추가 가능 (함수 호출, 전역, 매크로 등)
// //             mdLines.push(`| \`${name}\` | ❌ | (자동분류) |`);
// //         }
// //         mdLines.push('\n## 권장 가독성 전략');
// //         mdLines.push('1. `<BUGS>`/`<FIXS>` 토큰별 색상 하이라이팅');
// //         mdLines.push('2. 원본+패치 코드에 줄번호 주석 삽입');
// //         mdLines.push('3. 키워드·존재여부·분류 요약 테이블 추가');
// //         mdLines.push('4. 대규모 함수는 주변 ±5라인만 펼치고 나머지는 folding');
// //         mdLines.push('5. VS Code `// #region` / `// #endregion` 메타데이터로 섹션별 코드 접기');

// //         // 8) 새 에디터에 결과 열기
// //         vscode.workspace.openTextDocument({ content: mdLines.join('\n'), language: 'markdown' })
// //             .then(doc => vscode.window.showTextDocument(doc, { preview: false }));
// //     });

// //     context.subscriptions.push(disposable);
// // }

// // export function deactivate() {}