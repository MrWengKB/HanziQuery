#!/usr/bin/env python3
"""
检测 hanzilist.csv 中每个汉字是否被甲骨文字体收录，
并在 CSV 里新增（或更新）两列：
  「甲骨文」：有／无
  「甲骨文字」：网页切换甲骨文时实际要显示的字。
                这套字体多数字形放在繁体字的编码上（如「馬」而非「马」），
                所以简体字找不到时，会改查对应的繁体字。

用法：
  pip install fonttools opencc-python-reimplemented
  python check_oracle.py
  python check_oracle.py --csv hanzilist.csv --font FZ-oracle.ttf --col 汉字

运行前会自动备份原文件为 hanzilist.csv.bak。可重复运行，已有的「甲骨文」列会被覆盖更新。
"""
import argparse
import csv
import re
import shutil
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

NEW_COL = "甲骨文"
SHOW_COL = "甲骨文字"


def load_s2t_candidates():
    """读取 OpenCC 的简→繁单字表，一个简体字可能对应多个繁体字。"""
    import opencc
    path = Path(opencc.__file__).parent / "dictionary" / "STCharacters.txt"
    table = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "\t" in line:
            s, t = line.split("\t", 1)
            table[s] = t.split()
    return table
CJK_RE = re.compile(r"[\u3400-\u9fff\U00020000-\U0003134f\uf900-\ufaff]")


def make_checker(font_path):
    """返回一个函数 has(ch)：字体里有这个字、且字形不是空白时返回 True。"""
    font = TTFont(font_path, fontNumber=0)
    cmap = font.getBestCmap() or {}
    glyph_set = font.getGlyphSet()
    cache = {}

    def has(ch):
        if ch in cache:
            return cache[ch]
        name = cmap.get(ord(ch))
        ok = False
        if name and name != ".notdef":
            pen = BoundsPen(glyph_set)
            glyph_set[name].draw(pen)
            ok = pen.bounds is not None  # 空白字形没有边界
        cache[ch] = ok
        return ok

    return has


def detect_char_column(header, rows):
    """找出存放汉字的那一列：大多数值都是单个汉字的列。"""
    best, best_score = None, 0
    for i, name in enumerate(header):
        if name in (NEW_COL, SHOW_COL):
            continue
        values = [r[i].strip() for r in rows if i < len(r) and r[i].strip()]
        if not values:
            continue
        score = sum(1 for v in values if len(v) == 1 and CJK_RE.match(v)) / len(values)
        if score > best_score:
            best, best_score = i, score
    return best if best_score >= 0.8 else None


def main():
    ap = argparse.ArgumentParser(description="为 CSV 增加「甲骨文：有／无」一列")
    ap.add_argument("--csv", default="hanzilist.csv", help="CSV 路径（默认 hanzilist.csv）")
    ap.add_argument("--font", default="FZ-oracle.ttf", help="甲骨文字体路径（默认 FZ-oracle.ttf）")
    ap.add_argument("--col", help="汉字所在列的列名（不填则自动识别）")
    args = ap.parse_args()

    csv_path, font_path = Path(args.csv), Path(args.font)
    for p in (csv_path, font_path):
        if not p.exists():
            sys.exit(f"找不到文件：{p}")

    raw = csv_path.read_bytes()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    eol = "\r\n" if b"\r\n" in raw else "\n"
    rows = list(csv.reader(text.splitlines()))
    if not rows:
        sys.exit("CSV 是空的")
    header, body = rows[0], rows[1:]

    if args.col:
        if args.col not in header:
            sys.exit(f"表头里没有「{args.col}」这一列，现有列：{'、'.join(header)}")
        char_idx = header.index(args.col)
    else:
        char_idx = detect_char_column(header, body)
        if char_idx is None:
            sys.exit(f"无法自动识别汉字列，请用 --col 指定。现有列：{'、'.join(header)}")
    print(f"汉字列：「{header[char_idx]}」")

    for col in (NEW_COL, SHOW_COL):
        if col not in header:
            header.append(col)
    new_idx, show_idx = header.index(NEW_COL), header.index(SHOW_COL)

    has = make_checker(font_path)
    s2t = load_s2t_candidates()
    yes, no, odd, via_trad, ambiguous = 0, 0, [], [], []

    for line_no, row in enumerate(body, start=2):
        if not any(cell.strip() for cell in row):
            continue  # 跳过空行
        row.extend([""] * (len(header) - len(row)))
        ch = row[char_idx].strip()
        show = ""
        if len(ch) == 1:
            if has(ch):
                show = ch
            else:
                found = [t for t in s2t.get(ch, []) if t != ch and has(t)]
                if found:
                    show = found[0]
                    via_trad.append(f"{ch}→{show}")
                    if len(found) > 1:
                        ambiguous.append(f"{ch}：{'、'.join(found)}（已选 {show}）")
        if show:
            row[new_idx], row[show_idx] = "有", show
            yes += 1
        else:
            row[new_idx], row[show_idx] = "无", ""
            no += 1
            if len(ch) != 1:
                odd.append(f"第 {line_no} 行：「{ch}」")

    shutil.copy2(csv_path, csv_path.with_name(csv_path.name + ".bak"))
    with open(csv_path, "w", encoding="utf-8-sig" if has_bom else "utf-8", newline="") as f:
        csv.writer(f, lineterminator=eol).writerows([header] + body)

    print(f"完成：有 {yes} 字，无 {no} 字，已写入 {csv_path}（原文件备份为 {csv_path.name}.bak）")
    if via_trad:
        print(f"其中 {len(via_trad)} 字是通过繁体字找到的：{' '.join(via_trad)}")
    if ambiguous:
        print("以下简体字对应多个繁体字，字体里都有，请人工确认选得对不对：")
        for a in ambiguous:
            print("  " + a)
    if odd:
        print("以下行的汉字栏不是单个字，已标为「无」，请检查：")
        for o in odd:
            print("  " + o)


if __name__ == "__main__":
    main()
