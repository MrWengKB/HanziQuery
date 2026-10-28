// 去除拼音声调（用于不带声调的检索匹配）
function getPinyinPlain(py) {
  if (!py) return '';
  return py
    .normalize('NFD')
    .replace(/[\u0300\u0301\u0304\u030c]/g, '') // 只去掉声调符号（阴阳上去四声），保留 ü 的分音符
    .normalize('NFC') // 重新组合成 ü，而不是分解形式
    .toLowerCase()
    .trim();
}

// 提取声母/首字母
function getInitial(py) {
  const plain = getPinyinPlain(py);
  return plain ? plain.charAt(0).toUpperCase() : '';
}

// 解析 CSV 文本为汉字对象数组
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  
  const colIndex = {
    id: headers.findIndex(h => h.includes('序号')),
    grade: headers.findIndex(h => h.includes('年级')),
    char: headers.findIndex(h => h.includes('生字') || (h.includes('字') && !h.includes('甲骨文'))),
    radical: headers.findIndex(h => h.includes('部首')),
    strokes: headers.findIndex(h => h.includes('笔画')),
    structure: headers.findIndex(h => h.includes('结构')),
    lesson: headers.findIndex(h => h.includes('课次') || h.includes('课')),
    oracle: headers.findIndex(h => h === '甲骨文'),
    oracleChar: headers.findIndex(h => h === '甲骨文字')
  };

  const pinyinColIndices = [];
  headers.forEach((h, idx) => {
    if (h.includes('拼音')) {
      pinyinColIndices.push(idx);
    }
  });

  const yunmuColIndices = [];
  headers.forEach((h, idx) => {
    if (h.includes('韵母')) {
      yunmuColIndices.push(idx);
    }
  });

  // 课文词语列（不参与筛选下拉框，只用于搜索）
  const wordsColIndex = headers.findIndex(h => h.includes('词语'));

  const list = [];
  for (let i = 1; i < lines.length; i++) {
    const row = [];
    let insideQuotes = false;
    let field = '';
    for (let j = 0; j < lines[i].length; j++) {
      const c = lines[i][j];
      if (c === '"') {
        insideQuotes = !insideQuotes;
      } else if (c === ',' && !insideQuotes) {
        row.push(field.trim().replace(/^["']|["']$/g, ''));
        field = '';
      } else {
        field += c;
      }
    }
    row.push(field.trim().replace(/^["']|["']$/g, ''));

    if (row.length < 3) continue;

    const char = colIndex.char !== -1 ? (row[colIndex.char] || '') : '';
    if (!char) continue;

    // 提取并聚合所有拼音
    const pinyins = [];
    pinyinColIndices.forEach(idx => {
      const val = row[idx];
      if (val) {
        const subs = val.split(/[/、,，;；\s]+/).map(s => s.trim()).filter(Boolean);
        subs.forEach(s => {
          if (!pinyins.includes(s)) {
            pinyins.push(s);
          }
        });
      }
    });

    const pinyinDisplay = pinyins.join(' / ');
    const initials = [...new Set(pinyins.map(p => getInitial(p)).filter(Boolean))];
    const pinyinPlains = pinyins.map(p => getPinyinPlain(p));
    const strokesVal = parseInt(row[colIndex.strokes], 10);

    // 提取并聚合韵母（韵母1 对应拼音1，韵母2 对应拼音2，多音字去重）
    const finals = [];
    yunmuColIndices.forEach(idx => {
      const val = row[idx];
      if (val && !finals.includes(val)) {
        finals.push(val);
      }
    });

    // 课文词语（一格可存多个，用同样的分隔符拆开；只用于搜索，不建筛选下拉框）
    const words = [];
    if (wordsColIndex !== -1) {
      const val = row[wordsColIndex];
      if (val) {
        val.split(/[/、,，;；\s]+/).map(s => s.trim()).filter(Boolean).forEach(w => {
          if (!words.includes(w)) {
            words.push(w);
          }
        });
      }
    }

    list.push({
      id: colIndex.id !== -1 ? (parseInt(row[colIndex.id], 10) || i) : i,
      grade: colIndex.grade !== -1 ? (row[colIndex.grade] || 'P1') : 'P1',
      char: char,
      pinyins: pinyins,
      pinyin_display: pinyinDisplay,
      pinyin_plains: pinyinPlains,
      initials: initials,
      initial_display: initials.join(' / '),
      finals: finals,
      final_display: finals.join(' / '),
      words: words,
      words_display: words.join(' / '),
      radical: colIndex.radical !== -1 ? (row[colIndex.radical] || '') : '',
      strokes: isNaN(strokesVal) ? 0 : strokesVal,
      structure: colIndex.structure !== -1 ? (row[colIndex.structure] || '') : '',
      lesson: colIndex.lesson !== -1 ? (row[colIndex.lesson] || '') : '',
      // 甲骨文：是否收录，以及切换时实际显示的字（字体多用繁体编码，如「马」显示为「馬」）
      oracle: colIndex.oracle !== -1 && row[colIndex.oracle] === '有',
      oracle_char: (colIndex.oracleChar !== -1 && row[colIndex.oracleChar]) || char
    });
  }
  return list;
}
