import ActivityKit
import Foundation

// "Pages in progress" (05 §12, d-m-read): one Live Activity per aircraft from the end of a scan session until the
// pages are read. The attributes are shared with the widget extension, which draws it.

struct ReadingAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable, Sendable {
        enum Phase: String, Codable, Sendable { case onPhone, uploading, reading, read, paused }
        let phase: Phase
        /// The lock screen line, e.g. "Reading 4 pages · 2 of 4 read · a minute or two".
        let text: String
        /// Dynamic Island compact trailing: "2 held", "1/2", "2/4", "wait"; empty when read (a check is drawn).
        let compact: String
        let done: Int
        let total: Int
    }

    let aircraftId: String
    let tail: String
}
