//! Stitching the frames of a scrolled area into one tall image (PLAN 3K.3).
//! Pure: no Windows calls, so it's unit-tested. Worked out in the 3K.0 spike
//! (`decisions.md`, 2026-10-02), which tried it on Chrome, Edge, Firefox,
//! WebView2, Explorer and WinUI.
//!
//! Frames come one at a time, all the same size and already cut to the area.
//! For each new frame, against the one before:
//! 1. **Vote.** Each of [`K`] column strips finds its own best vertical shift;
//!    the shift most strips agree on is the content's. A sidebar with its own
//!    scroll, or a fixed panel, loses the vote.
//! 2. **Columns.** The pixel columns that follow that shift in (nearly) every
//!    row are the ones used to match; the rest (the sidebar, the scrollbar)
//!    are ignored for matching but still kept in the image.
//! 3. **Match.** Within those columns, rows identical at the same position from
//!    the top and bottom are fixed (a sticky header, a footer); the shift is
//!    found exactly (row blocks that match, minus twice those that don't), with
//!    a fuzzy fallback on block brightness for text antialiased at a sub-pixel
//!    offset.
//! 4. **Append.** The first frame down to the footer line, then each frame's
//!    `d` rows that came in above that line; the last frame's footer at the end.
//!
//! Only the previous frame and the growing image are kept.

/// Top-down BGRA (any 4-byte pixel order works), stride = `width * 4`.
#[derive(Clone, PartialEq, Eq)]
pub struct Image {
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
}

impl std::fmt::Debug for Image {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Image({}x{})", self.width, self.height)
    }
}

impl Image {
    /// Columns `x0..x1`, all rows.
    pub fn columns(&self, x0: u32, x1: u32) -> Image {
        self.crop(x0, 0, x1, self.height)
    }

    /// The rect `l..r` × `t..b`, clamped to the image.
    pub fn crop(&self, l: u32, t: u32, r: u32, b: u32) -> Image {
        let (r, b) = (r.min(self.width), b.min(self.height));
        let (l, t) = (l.min(r), t.min(b));
        let w = (r - l) as usize;
        let stride = self.width as usize * 4;
        let mut bgra = Vec::with_capacity(w * (b - t) as usize * 4);
        for y in t as usize..b as usize {
            let s = y * stride + l as usize * 4;
            bgra.extend_from_slice(&self.bgra[s..s + w * 4]);
        }
        Image {
            width: w as u32,
            height: b - t,
            bgra,
        }
    }

    fn row(&self, y: usize) -> &[u8] {
        let stride = self.width as usize * 4;
        &self.bgra[y * stride..][..stride]
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Params {
    /// Columns at the right edge that don't follow the scroll (a scrollbar)
    /// are left out of the image if there are at most this many.
    pub scrollbar: u32,
    /// The frames must overlap by at least this many rows.
    pub min_overlap: u32,
}

impl Params {
    /// For an area on a monitor with this DPI scale (1.0 = 96 DPI).
    pub fn for_scale(scale: f64) -> Self {
        Self {
            scrollbar: (24.0 * scale).round() as u32,
            min_overlap: (8.0 * scale).round() as u32,
        }
    }
}

/// What a new frame was, against the one before.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Step {
    /// Identical: nothing moved.
    Same,
    /// The content moved up by this many rows; they were added.
    Moved(u32),
    /// No convincing shift: the page changed, or the frames don't overlap.
    Lost(String),
}

/// Blocks per row.
const K: usize = 32;

/// Per-row hashes of one frame.
struct Rows {
    /// Whole row (fixed rows, no-change detection).
    hash: Vec<u64>,
    blocks: Vec<[u64; K]>,
    /// Bit k: block k is one flat color, or repeats the row above (a vertical
    /// line, a border). It would match at any small shift, so it doesn't vote.
    flat: Vec<u32>,
    /// Mean brightness of each block, for the fuzzy fallback.
    mean: Vec<[f32; K]>,
}

fn fnv(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for chunk in bytes.chunks_exact(8) {
        h ^= u64::from_le_bytes(chunk.try_into().unwrap());
        h = h.wrapping_mul(0x100000001b3).rotate_left(29);
    }
    for b in bytes.chunks_exact(8).remainder() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// Colors only: alpha is ignored everywhere.
fn same_px(a: &[u8], b: &[u8]) -> bool {
    a[..3] == b[..3]
}

impl Rows {
    fn of(img: &Image) -> Rows {
        let w = img.width as usize;
        let n = img.height as usize;
        let mut out = Rows {
            hash: Vec::with_capacity(n),
            blocks: Vec::with_capacity(n),
            flat: Vec::with_capacity(n),
            mean: Vec::with_capacity(n),
        };
        let mut rgb = Vec::with_capacity(w * 3);
        for y in 0..n {
            let row = img.row(y);
            // Hash colors only, so a varying alpha byte can't break matches.
            rgb.clear();
            for px in row.chunks_exact(4) {
                rgb.extend_from_slice(&px[..3]);
            }
            out.hash.push(fnv(&rgb));
            let mut blocks = [0u64; K];
            let mut flat = 0u32;
            let mut mean = [0f32; K];
            for k in 0..K {
                let (s, e) = (k * w / K, (k + 1) * w / K);
                let b = &rgb[s * 3..e * 3];
                blocks[k] = fnv(b);
                let uniform = b.chunks_exact(3).all(|px| px == &b[..3]);
                let repeats = out
                    .blocks
                    .last()
                    .is_some_and(|p: &[u64; K]| p[k] == blocks[k]);
                if b.is_empty() || uniform || repeats {
                    flat |= 1 << k;
                }
                let sum: u32 = b.iter().map(|&c| c as u32).sum();
                mean[k] = sum as f32 / (b.len() / 3).max(1) as f32;
            }
            out.blocks.push(blocks);
            out.flat.push(flat);
            out.mean.push(mean);
        }
        out
    }

    /// Rows identical at the same position from the top, and from the bottom.
    fn fixed(&self, other: &Rows) -> (usize, usize) {
        let h = self.hash.len();
        let header = (0..h)
            .take_while(|&y| self.hash[y] == other.hash[y])
            .count();
        if header == h {
            return (h, 0);
        }
        let footer = (0..h)
            .rev()
            .take_while(|&y| self.hash[y] == other.hash[y])
            .count();
        (header, footer)
    }
}

/// Step 1: each strip's best shift; the one most strips agree on.
fn vote(a: &Rows, b: &Rows, p: &Params) -> Option<u32> {
    let h = a.hash.len();
    let (top, footer) = a.fixed(b);
    if top == h {
        return None;
    }
    let bottom = h - footer;
    let max_d = (bottom - top).saturating_sub(p.min_overlap as usize);
    // shift -> (strips, matched rows)
    let mut tally: std::collections::HashMap<u32, (u32, u32)> = Default::default();
    for k in 0..K {
        let mut best = (i64::MIN, 0u32, 0u32); // (score, matches, d)
        for d in 1..=max_d {
            let (mut m, mut c) = (0u32, 0u32);
            for y in top..bottom - d {
                if (b.flat[y] & a.flat[y + d]) & (1 << k) != 0 {
                    continue;
                }
                c += 1;
                m += (b.blocks[y][k] == a.blocks[y + d][k]) as u32;
            }
            let score = m as i64 - 2 * (c - m) as i64;
            if score > best.0 {
                best = (score, m, d as u32);
            }
        }
        // A strip needs a few real rows, nearly all matching, to vote.
        if best.1 >= 8 && best.0 > 0 {
            let e = tally.entry(best.2).or_default();
            e.0 += 1;
            e.1 += best.1;
        }
    }
    // Most strips wins (a small wrong shift has a long overlap, so counting
    // rows would favor it); ties go to rows.
    tally
        .into_iter()
        .max_by_key(|&(d, (strips, rows))| (strips, rows, std::cmp::Reverse(d)))
        .map(|(d, _)| d)
}

/// Step 2: the longest run of columns that follow shift `d` from `a` to `b`.
/// Rows that mostly mismatch (a header changing as it collapses) are skipped;
/// a column may mismatch in 0.5% of the rest.
fn following(a: &Image, b: &Image, d: usize) -> Vec<bool> {
    let (w, h) = (a.width as usize, a.height as usize);
    let mut bad = vec![0u32; w];
    let mut row_bad = vec![false; w];
    let mut compared = 0u32;
    // Fixed rows at the top and bottom don't follow, in every column.
    let eq = |y: usize| a.row(y) == b.row(y);
    let header = (0..h).take_while(|&y| eq(y)).count();
    let footer = (0..h).rev().take_while(|&y| eq(y)).count().min(h - header);
    let end = (h - footer).saturating_sub(d);
    for y in header..end {
        let (ra, rb) = (a.row(y + d), b.row(y));
        let mut n = 0;
        for x in 0..w {
            row_bad[x] = !same_px(&ra[x * 4..], &rb[x * 4..]);
            n += row_bad[x] as usize;
        }
        if n * 2 > w {
            continue;
        }
        compared += 1;
        for x in 0..w {
            bad[x] += row_bad[x] as u32;
        }
    }
    let allowed = compared / 200;
    bad.into_iter().map(|n| n <= allowed).collect()
}

fn longest_run(mask: &[bool]) -> Option<(usize, usize)> {
    let mut best: Option<(usize, usize)> = None;
    let mut start = None;
    for x in 0..=mask.len() {
        let on = x < mask.len() && mask[x];
        match (on, start) {
            (true, None) => start = Some(x),
            (false, Some(s)) => {
                if best.is_none_or(|(b0, b1)| x - s > b1 - b0) {
                    best = Some((s, x));
                }
                start = None;
            }
            _ => {}
        }
    }
    best
}

struct Match {
    footer: usize,
    shift: Result<u32, String>,
}

/// Step 3, on frames cut to the columns that follow. `hint` is the shift the
/// scroller expected: among shifts that match (almost) perfectly, which happens
/// with content that repeats exactly, the one closest to it wins.
fn match_rows(a: &Rows, b: &Rows, p: &Params, hint: Option<u32>) -> Match {
    let h = a.hash.len();
    let (header, footer) = a.fixed(b);
    if header == h {
        return Match {
            footer: 0,
            shift: Err("no change in the matched columns".into()),
        };
    }
    let (top, bottom) = (header, h - footer);
    let max_d = (bottom - top).saturating_sub(p.min_overlap as usize);
    let mut best = (i64::MIN, 0u32, 0u32, 0u32); // (score, matches, compared, d)
    let mut perfect: Vec<u32> = Vec::new();
    for d in 1..=max_d {
        let (mut m, mut c) = (0u32, 0u32);
        for y in top..bottom - d {
            let both_flat = b.flat[y] & a.flat[y + d];
            for k in 0..K {
                if both_flat & (1 << k) != 0 {
                    continue;
                }
                c += 1;
                m += (b.blocks[y][k] == a.blocks[y + d][k]) as u32;
            }
        }
        // Mismatches count against: with repeated content (identical
        // paragraphs), a wrong shift with a longer overlap would otherwise
        // collect more matches than the right one.
        let score = m as i64 - 2 * (c - m) as i64;
        if score > best.0 {
            best = (score, m, c, d as u32);
        }
        if m >= 8 && m * 100 >= c * 98 {
            perfect.push(d as u32);
        }
    }
    if let (Some(h), true) = (hint, perfect.len() > 1) {
        if let Some(&d) = perfect.iter().min_by_key(|&&d| d.abs_diff(h)) {
            return Match {
                footer,
                shift: Ok(d),
            };
        }
    }
    let (_, m, c, d) = best;
    let shift = if m > 0 && m * 10 >= c * 7 {
        Ok(d)
    } else {
        fuzzy(a, b, top, bottom, max_d, hint)
            .map_err(|e| format!("weak match {m}/{c} at {d}; fuzzy: {e}"))
    };
    Match { footer, shift }
}

/// The shift with the smallest mean difference in block brightness, if it's
/// clearly better than any shift more than 3 rows away, and either close
/// overall or where the scroller expected (`hint`).
fn fuzzy(
    a: &Rows,
    b: &Rows,
    top: usize,
    bottom: usize,
    max_d: usize,
    hint: Option<u32>,
) -> Result<u32, String> {
    let mut scores: Vec<(f32, u32)> = (1..=max_d)
        .map(|d| {
            let mut sum = 0f32;
            for y in top..bottom - d {
                let (rb, ra) = (&b.mean[y], &a.mean[y + d]);
                sum += (0..K).map(|k| (rb[k] - ra[k]).abs()).sum::<f32>();
            }
            let n = ((bottom - d - top) * K).max(1) as f32;
            (sum / n, d as u32)
        })
        .collect();
    scores.sort_by(|x, y| x.0.total_cmp(&y.0));
    let Some(&(best, d)) = scores.first() else {
        return Err("no overlap".into());
    };
    let rival = scores
        .iter()
        .find(|s| s.1.abs_diff(d) > 3)
        .map_or(f32::MAX, |s| s.0);
    // Brightness is summed over three channels (0..765). Firefox once gave
    // 7.7 at the expected shift against 23.5 elsewhere (3K.3): trust that.
    let expected = hint.is_some_and(|h| h.abs_diff(d) <= 2);
    if best * 3.0 < rival && (best < 6.0 || (expected && best < 20.0)) {
        Ok(d)
    } else {
        Err(format!(
            "best {d} differs by {best:.1}, the next by {rival:.1}"
        ))
    }
}

pub struct Stitcher {
    params: Params,
    prev: Image,
    prev_rows: Rows,
    /// The footer line (rows from the top), set by the first frame that moved.
    line: Option<usize>,
    /// Columns that failed to follow the scroll at least once: at the right
    /// edge, that's a scrollbar (its track is flat, so only the thumb gives it
    /// away, and only when it's in the rows compared).
    strays: Vec<bool>,
    out: Vec<u8>,
}

impl Stitcher {
    pub fn new(first: Image, params: Params) -> Self {
        Self {
            params,
            prev_rows: Rows::of(&first),
            strays: vec![false; first.width as usize],
            prev: first,
            line: None,
            out: Vec::new(),
        }
    }

    /// Add the next frame. It must be the same size as the first. `hint` is
    /// how far the scroller expected it to move, if it knows.
    pub fn push(&mut self, next: Image, hint: Option<u32>) -> Step {
        assert_eq!(
            (next.width, next.height),
            (self.prev.width, self.prev.height)
        );
        let rows = Rows::of(&next);
        if rows.hash == self.prev_rows.hash {
            return Step::Same;
        }
        let d_vote = vote(&self.prev_rows, &rows, &self.params);
        let (x0, x1) = d_vote
            .and_then(|d| longest_run(&following(&self.prev, &next, d as usize)))
            .unwrap_or((0, next.width as usize));
        let m = if (x0, x1) == (0, next.width as usize) {
            match_rows(&self.prev_rows, &rows, &self.params, hint)
        } else {
            let (a, b) = (
                self.prev.columns(x0 as u32, x1 as u32),
                next.columns(x0 as u32, x1 as u32),
            );
            match_rows(&Rows::of(&a), &Rows::of(&b), &self.params, hint)
        };
        let d = match (m.shift, d_vote) {
            (Ok(d), _) => d,
            // Exact and fuzzy both failed: trust the vote.
            (Err(_), Some(d)) => d,
            (Err(e), None) => return Step::Lost(e),
        };
        let h = next.height as usize;
        // The footer as the first move shows it, but never more than half the
        // frame. (Later frames can't change it: earlier rows are already in.)
        let line = *self.line.get_or_insert(h - m.footer.min(h / 2));
        if self.out.is_empty() {
            push_rows(&mut self.out, &self.prev, 0, line);
        }
        for (stray, follows) in self
            .strays
            .iter_mut()
            .zip(following(&self.prev, &next, d as usize))
        {
            *stray |= !follows;
        }
        let d = (d as usize).min(line);
        push_rows(&mut self.out, &next, line - d, line);
        self.prev = next;
        self.prev_rows = rows;
        Step::Moved(d as u32)
    }

    /// Height of the image so far, the last frame's footer included.
    pub fn height(&self) -> u32 {
        match self.line {
            Some(line) => {
                (self.out.len() / (self.prev.width as usize * 4) + self.prev.height as usize - line)
                    as u32
            }
            None => self.prev.height,
        }
    }

    /// The finished image, at most `max_height` rows (the top of it), without
    /// a scrollbar at the right edge.
    pub fn finish(mut self, max_height: u32) -> Image {
        let width = self.prev.width;
        let Some(line) = self.line else {
            let first = self.prev;
            return first.crop(0, 0, width, max_height);
        };
        let h = self.prev.height as usize;
        push_rows(&mut self.out, &self.prev, line, h);
        let stride = width as usize * 4;
        let height = (self.out.len() / stride).min(max_height as usize);
        self.out.truncate(height * stride);
        let image = Image {
            width,
            height: height as u32,
            bgra: self.out,
        };
        let trailing = self.strays.iter().rev().take_while(|&&s| s).count();
        if trailing > 0 && trailing <= self.params.scrollbar as usize && trailing < width as usize {
            image.columns(0, width - trailing as u32)
        } else {
            image
        }
    }
}

/// Rows `from..to` of `img`.
fn push_rows(out: &mut Vec<u8>, img: &Image, from: usize, to: usize) {
    for y in from..to {
        out.extend_from_slice(img.row(y));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A made-up page: rows of "text" (pseudo-random pixels in short runs)
    /// with blank gaps, like lines of text and paragraph breaks.
    fn page(width: u32, height: u32, seed: u64) -> Image {
        let mut bgra = Vec::with_capacity((width * height * 4) as usize);
        for y in 0..height as u64 {
            let blank = (y / 7) % 5 == 4;
            for x in 0..width as u64 {
                let v = if blank {
                    250
                } else {
                    let mut h = (x / 3) ^ (y.wrapping_mul(0x9e37_79b9)) ^ seed;
                    h = h.wrapping_mul(0xff51_afd7_ed55_8ccd);
                    h ^= h >> 29;
                    (h % 200) as u8
                };
                bgra.extend_from_slice(&[v, v.wrapping_add(17), v / 2, 255]);
            }
        }
        Image {
            width,
            height,
            bgra,
        }
    }

    /// What the viewport shows at scroll offset `off`.
    fn view(page: &Image, off: u32, h: u32) -> Image {
        page.crop(0, off, page.width, off + h)
    }

    /// Paint rows `t..b` of `img` with `src`'s rows `0..b-t` (a fixed bar).
    fn overlay_rows(img: &mut Image, src: &Image, t: u32) {
        let stride = img.width as usize * 4;
        for y in 0..src.height as usize {
            let d = (t as usize + y) * stride;
            img.bgra[d..d + stride].copy_from_slice(src.row(y));
        }
    }

    const P: Params = Params {
        scrollbar: 24,
        min_overlap: 8,
    };

    fn stitch(frames: Vec<Image>) -> (Vec<Step>, Image) {
        let mut it = frames.into_iter();
        let mut s = Stitcher::new(it.next().unwrap(), P);
        let steps = it.map(|f| s.push(f, None)).collect();
        (steps, s.finish(u32::MAX))
    }

    #[test]
    fn rebuilds_a_plain_page() {
        let p = page(200, 1000, 1);
        let offsets = [0, 300, 550, 600];
        let (steps, out) = stitch(offsets.iter().map(|&o| view(&p, o, 400)).collect());
        assert_eq!(
            steps,
            vec![Step::Moved(300), Step::Moved(250), Step::Moved(50)]
        );
        assert_eq!(out, p);
    }

    #[test]
    fn a_frame_that_did_not_move_is_same() {
        let p = page(120, 600, 2);
        let mut s = Stitcher::new(view(&p, 0, 200), P);
        assert_eq!(s.push(view(&p, 0, 200), None), Step::Same);
        assert_eq!(s.push(view(&p, 150, 200), None), Step::Moved(150));
        assert_eq!(s.height(), 350);
    }

    #[test]
    fn keeps_a_sticky_header_once() {
        let p = page(160, 900, 3);
        let bar = page(160, 30, 99);
        let frames: Vec<Image> = [0, 200, 400, 600]
            .iter()
            .map(|&o| {
                let mut f = view(&p, o, 300);
                overlay_rows(&mut f, &bar, 0);
                f
            })
            .collect();
        let (steps, out) = stitch(frames);
        assert!(steps.iter().all(|s| *s == Step::Moved(200)), "{steps:?}");
        // The bar, then the page from under it to the end.
        let mut want = bar.clone();
        want.bgra.extend_from_slice(&p.crop(0, 30, 160, 900).bgra);
        want.height = 900;
        assert_eq!(out, want);
    }

    #[test]
    fn keeps_a_fixed_footer_once_at_the_end() {
        let p = page(160, 900, 4);
        let bar = page(160, 40, 77);
        let frames: Vec<Image> = [0, 250, 500, 600]
            .iter()
            .map(|&o| {
                let mut f = view(&p, o, 300);
                overlay_rows(&mut f, &bar, 260);
                f
            })
            .collect();
        let (_, out) = stitch(frames);
        let mut want = p.crop(0, 0, 160, 860);
        want.bgra.extend_from_slice(&bar.bgra);
        want.height = 900;
        assert_eq!(out, want);
    }

    #[test]
    fn exactly_repeating_content_needs_the_hint() {
        // The same 70-row paragraph over and over: 20, 90, 160 and 230 all
        // match perfectly. Without a hint the longest overlap wins (wrong);
        // with the scroller's expected shift, the right one does.
        let para = page(150, 70, 5);
        let mut p = para.clone();
        for _ in 0..11 {
            p.bgra.extend_from_slice(&para.bgra);
            p.height += 70;
        }
        // Make the page distinct only at the very top, as a heading would be.
        let head = page(150, 20, 6);
        overlay_rows(&mut p, &head, 0);
        let mut s = Stitcher::new(view(&p, 0, 300), P);
        assert_eq!(s.push(view(&p, 230, 300), None), Step::Moved(20));
        let mut s = Stitcher::new(view(&p, 0, 300), P);
        assert_eq!(s.push(view(&p, 230, 300), Some(225)), Step::Moved(230));
        assert_eq!(s.push(view(&p, 460, 300), Some(225)), Step::Moved(230));
        assert_eq!(s.finish(u32::MAX), p.crop(0, 0, 150, 760));
    }

    #[test]
    fn a_fixed_sidebar_stays_in_the_image_but_not_in_the_match() {
        let p = page(300, 1000, 7);
        let side = page(80, 300, 8);
        let frames: Vec<Image> = [0, 280, 560]
            .iter()
            .map(|&o| {
                let mut f = view(&p, o, 300);
                for y in 0..300usize {
                    let d = y * 300 * 4;
                    f.bgra[d..d + 80 * 4].copy_from_slice(side.row(y));
                }
                f
            })
            .collect();
        let (steps, out) = stitch(frames);
        assert_eq!(steps, vec![Step::Moved(280), Step::Moved(280)]);
        assert_eq!((out.width, out.height), (300, 860));
        // The scrolling part is the page's.
        assert_eq!(out.crop(80, 0, 300, 860), p.crop(80, 0, 300, 860),);
    }

    #[test]
    fn trims_a_scrollbar_at_the_right_edge() {
        // A 12 px scrollbar whose thumb is as tall, and as far down, as the
        // view is on the page.
        let (page_h, view_h) = (3000u32, 400u32);
        let p = page(220, page_h, 9);
        let frames: Vec<Image> = (0..=8)
            .map(|i| (i * 325).min(page_h - view_h))
            .map(|o| {
                let mut f = view(&p, o, view_h);
                let (top, len) = (o * view_h / page_h, view_h * view_h / page_h);
                for y in 0..view_h {
                    let thumb = (top..top + len).contains(&y);
                    for x in 208..220u32 {
                        let px = if thumb {
                            [90, 90, 90, 255]
                        } else {
                            [230, 230, 230, 255]
                        };
                        f.bgra[((y * 220 + x) * 4) as usize..][..4].copy_from_slice(&px);
                    }
                }
                f
            })
            .collect();
        let (steps, out) = stitch(frames);
        assert!(
            steps.iter().all(|s| matches!(s, Step::Moved(_))),
            "{steps:?}"
        );
        assert_eq!(out, p.crop(0, 0, 208, page_h));
    }

    #[test]
    fn a_page_that_changed_is_lost() {
        let a = page(200, 300, 10);
        let b = page(200, 300, 11);
        let mut s = Stitcher::new(a, P);
        assert!(matches!(s.push(b, None), Step::Lost(_)));
    }

    #[test]
    fn finish_caps_the_height() {
        let p = page(100, 1000, 12);
        let mut s = Stitcher::new(view(&p, 0, 300), P);
        s.push(view(&p, 250, 300), None);
        s.push(view(&p, 500, 300), None);
        assert_eq!(s.height(), 800);
        assert_eq!(s.finish(600), p.crop(0, 0, 100, 600));
    }

    #[test]
    fn ignores_alpha() {
        let p = page(100, 700, 13);
        let mut b = view(&p, 200, 300);
        for px in b.bgra.chunks_exact_mut(4) {
            px[3] = 7;
        }
        let mut s = Stitcher::new(view(&p, 0, 300), P);
        assert_eq!(s.push(b, None), Step::Moved(200));
    }
}
