/**
 * Where a request's marker is in the body of its comment: OPENS for the comments of a run's
 * progress and details, whose first line it is, so that a comment that only quotes it further in
 * is someone's reply, never rewritten; ANYWHERE for a review, which it closes.
 * @typedef {'opens' | 'anywhere'} MarkerAt
 */
export const OPENS = 'opens'
export const ANYWHERE = 'anywhere'

/** Whether the comment's body holds the marker where the request says it is. @param {string} body @param {{ marker: string, markerAt: MarkerAt }} request */
export const holdsMarker = (body, { marker, markerAt }) => (markerAt === OPENS ? body.startsWith(marker) : body.includes(marker))
