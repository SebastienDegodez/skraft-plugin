// Port for the remote side of report publication (assets/reporting/mcp-publication.md): the
// host's MCP tools, reached by a delegated agent — scripts cannot call them. The code keeps
// the protocol (prepare, decide, record); the transport only observes and writes.
// Contract:
//   observe({ packet })            => Promise<snapshot | null>
//     the normalized snapshot of the packet's target (viewer, every comment, complete,
//     capabilities, provenance); null when no trustworthy snapshot could be read
//   publish({ packet, decision })  => Promise<readback | null>
//     create/update: write the exact packet body to the decided comment, then read it back
//     afresh; unchanged: read it back only. null when the write or the readback failed.
// Snapshot and readback follow "Normalized observation contract"; they are observations,
// never a packet or a decision. MUST NOT throw for a transport failure.
export const REPORT_TRANSPORT_PORT = 'ReportTransport'
