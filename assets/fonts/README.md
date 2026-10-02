# Project font

`force.ttf` is the project face.

## Source

Copied from the sibling ara project at `ara/fonts/ara.ttf`, where it was the
project face under the family name Ara. The file was renamed, not redrawn.

- source sha256: `d8e364a17c1874c21ac48269335aed640fb60808bfa7f40fa6b78c23a01fdeaa`
- this file sha256: `726cc0f79a5eb2e6b2bcf50e24351f78aab789f29f3dfa148315ee7024d5d5a9`

The face is 18 Khebrat Musamim, an OpenType/CFF font (sfnt version `OTTO`, 374
glyphs, cmap subtables 0/3, 1/0, and 3/1). The copyright entry (name ID 0) reads
"18 Khebrat Musamim" and the version entry (name ID 5) reads "Version 03 March
31, 2018 des. Azhari Phatani". Both are carried through unchanged, as are the CFF
Weight, Copyright, and version fields.

## Rename

```
name ID 1 (family)                Ara              -> Force
name ID 2 (subfamily)             Regular          -> Regular
name ID 3 (unique id)             Ara;Ara-Regular  -> Force;Force-Regular
name ID 4 (full name)             Ara              -> Force
name ID 6 (PostScript name)       Ara-Regular      -> Force-Regular
CFF Name INDEX                   18KhebratMusamim -> Force-Regular
CFF TopDict FamilyName, FullName  uniFEFC          -> Force
```

The Mac and Windows name records both carry the new strings. `OS/2.usWeightClass`
stays 500 with subfamily Regular, as it was in the source.

Glyph order, outlines, CFF charstrings, hmtx advances, every cmap subtable, and
the `GSUB`, `GPOS`, `GDEF`, `OS/2`, `hhea`, `maxp`, and `post` tables match the
source byte for byte. The `CFF `, `name`, and `head` tables differ, and `head`
differs only in `checkSumAdjustment`, recalculated for the new file.

## Rebuild

fontTools 4.65.0 loaded `ara/fonts/ara.ttf`, rewrote the fields listed above, and
saved the result with `reorderTables=False`. Nothing was patched at the byte
level and no glyphs were subset. Checks run afterwards: an sfnt directory and
checksum validator, `ttx` XML dumps of every table diffed against the source, and
`fc-query`, which reports family `Force`, full name `Force`, and PostScript name
`Force-Regular`.

One leftover oddity is preserved on purpose. Glyph 2 is named
"18 Khebrat Musamim" in the CFF charset and is mapped to tab, line feed, and
carriage return in the Mac cmap subtable.
