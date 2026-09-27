//! In-memory store of recent captures (PLAN §4.3). Full-resolution pixels stay
//! in Rust; the webview fetches them through the custom protocol.

use std::collections::VecDeque;
use std::sync::Arc;

use crate::capture::MonitorFrame;

pub type CaptureId = u32;

pub struct Capture {
    pub id: CaptureId,
    pub frames: Vec<Arc<MonitorFrame>>,
}

pub struct FrameStore {
    capacity: usize,
    next_id: CaptureId,
    /// Oldest first.
    captures: VecDeque<Arc<Capture>>,
}

impl FrameStore {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            next_id: 1,
            captures: VecDeque::new(),
        }
    }

    /// Store a capture, evicting the oldest if over capacity.
    pub fn insert(&mut self, frames: Vec<MonitorFrame>) -> Arc<Capture> {
        let capture = Arc::new(Capture {
            id: self.next_id,
            frames: frames.into_iter().map(Arc::new).collect(),
        });
        self.next_id = self.next_id.wrapping_add(1).max(1);
        self.captures.push_back(capture.clone());
        while self.captures.len() > self.capacity {
            self.captures.pop_front();
        }
        capture
    }

    pub fn get(&self, id: CaptureId) -> Option<Arc<Capture>> {
        self.captures.iter().find(|c| c.id == id).cloned()
    }

    pub fn frame(&self, id: CaptureId, monitor_index: u32) -> Option<Arc<MonitorFrame>> {
        self.get(id)?
            .frames
            .iter()
            .find(|f| f.monitor.index == monitor_index)
            .cloned()
    }

    pub fn remove(&mut self, id: CaptureId) -> bool {
        let before = self.captures.len();
        self.captures.retain(|c| c.id != id);
        self.captures.len() != before
    }

    /// Change how many captures are kept, evicting the oldest if needed.
    pub fn set_capacity(&mut self, capacity: usize) {
        self.capacity = capacity.max(1);
        while self.captures.len() > self.capacity {
            self.captures.pop_front();
        }
    }

    pub fn len(&self) -> usize {
        self.captures.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::{MonitorInfo, PhysicalRect};

    fn frame(index: u32) -> MonitorFrame {
        MonitorFrame {
            monitor: MonitorInfo {
                index,
                name: String::new(),
                physical_bounds: PhysicalRect::new(0, 0, 2, 1),
                work_area: PhysicalRect::new(0, 0, 2, 1),
                scale_factor: 1.0,
                is_primary: index == 0,
            },
            width: 2,
            height: 1,
            bgra: vec![index as u8; 8],
        }
    }

    #[test]
    fn evicts_oldest_beyond_capacity() {
        let mut store = FrameStore::new(3);
        let ids: Vec<_> = (0..5).map(|_| store.insert(vec![frame(0)]).id).collect();
        assert_eq!(store.len(), 3);
        assert!(store.get(ids[0]).is_none());
        assert!(store.get(ids[1]).is_none());
        for id in &ids[2..] {
            assert!(store.get(*id).is_some());
        }
    }

    #[test]
    fn ids_are_unique_and_nonzero() {
        let mut store = FrameStore::new(2);
        let a = store.insert(vec![]).id;
        let b = store.insert(vec![]).id;
        assert_ne!(a, 0);
        assert_ne!(a, b);
    }

    #[test]
    fn frame_lookup_by_monitor_index() {
        let mut store = FrameStore::new(3);
        let id = store.insert(vec![frame(0), frame(1)]).id;
        assert_eq!(store.frame(id, 1).unwrap().bgra[0], 1);
        assert!(store.frame(id, 2).is_none());
        assert!(store.frame(id + 1, 0).is_none());
    }

    #[test]
    fn remove_frees_capture() {
        let mut store = FrameStore::new(3);
        let id = store.insert(vec![frame(0)]).id;
        let held = store.frame(id, 0).unwrap();
        assert!(store.remove(id));
        assert!(!store.remove(id));
        assert_eq!(store.len(), 0);
        // Outstanding readers (e.g. an in-flight protocol response) keep their Arc.
        assert_eq!(held.width, 2);
    }

    #[test]
    fn shrinking_capacity_evicts_oldest() {
        let mut store = FrameStore::new(3);
        let ids: Vec<_> = (0..3).map(|_| store.insert(vec![]).id).collect();
        store.set_capacity(1);
        assert_eq!(store.len(), 1);
        assert!(store.get(ids[2]).is_some());
    }

    #[test]
    fn zero_capacity_keeps_one() {
        let mut store = FrameStore::new(0);
        let id = store.insert(vec![frame(0)]).id;
        assert!(store.get(id).is_some());
    }
}
