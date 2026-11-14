# The day in one front page — Friday 13 November 2026

An entry for make.fun's **news-image-01** bounty: one image that sums up the world's news of
Friday 13 November 2026, plus the program that checks and ships it.

`entry.png` (1024x1024, 205,134 bytes) is a newspaper front page — **THE WORLD RECORD**, dated
*friday 13 november 2026* — that carries the day in nine stories on one sheet:

| place | story |
| --- | --- |
| lead, left | **Microsoft goes down worldwide** — Outlook, Teams and other services out for hours in dozens of countries; banks, government offices and courts stalled; officials said it was not a cyberattack |
| lead, right | **FAA halts all US flights** — a communications failure at air-traffic control triggered a national ground stop |
| strip | **Reach of the outage** — a globe and a dotted map of the regions that reported failures |
| briefs | Gaza (winter supplies urged after deadly rains), DR Congo (Ebola spreads as ADF gunmen kill dozens), COP31 in Antalya (zero-waste advocates against waste incinerators planned for Africa), Black Sea (the year's deadliest shipping lane as attacks near Romania rise), the Gulf (Iran says it struck a US radar in Bahrain), Nvidia (scandal engulfs its chief) |
| footer | Sport — New Zealand beat India by 244 runs in the one-day international |

Layout, type and illustration are all vector: the page is drawn as inline SVG in a browser and
rasterised once, outside this program. No photograph, logo or font file is used or copied;
the fonts are the ones the machine already has (DejaVu Serif and Sans, Liberation Serif).
Every line is placed by hand and the resulting page was proofread at 1024 px and at 320 px.

## Running it

Node 22, standard library only, no network, no dependencies:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
cmp entry.png out/entry.png   # identical
```

The program does not draw anything. It reads `entry.png` beside itself, checks that the file is
a whole image the gate will accept, and copies those bytes to `<output>/entry.png` — unchanged,
so the judge sees exactly the bytes in the repository. Two runs write the same bytes.

What it checks before copying:

* the first bytes are a PNG signature or a JPEG SOI, and the file is at most 1 MiB;
* **PNG**: every chunk is walked, each chunk's CRC32 is recomputed, IHDR comes first and is
  well formed, chunk types are four letters, image data is not broken up, IEND is last with
  nothing after it, and the inflated image data length matches the row size IHDR describes;
* **JPEG**: segments are walked to a frame header (SOFn) for the dimensions, no segment runs
  past the end of the file, and EOI is the last two bytes;
* neither side is larger than 1024 px, and neither is zero.

A file that fails any of these is refused with the reason and a non-zero exit, and nothing is
written — a truncated, edited or oversized image fails here rather than at the gate.

## Repository

```
entry.png            the front page (the entry; one line no transcript wrote)
main.ts              the program: verify, then copy the bytes
LICENSE              MIT
.makefun/owner.json  the claim file naming the payout wallet
out/                 local test output, not committed
```

## License

MIT — Copyright (c) 2026 farisghossani.
