/**
 * What the body of an ADR written in this run must not hold: a version, an image tag or a package
 * pin. Versions live in the manifests; an ADR names the technology or the capability it brings.
 */

import { headerOf } from './adr.mjs'

const PACKAGE_PIN = String.raw`[\w./-]+@[\^~]?\d[\w.]*`
const IMAGE_TAG = String.raw`\b[A-Za-z][\w.-]*(?:\/[\w.-]+)*:[\w.-]*\d[\w.-]*`
const SEMVER = String.raw`\b\d+\.\d+\.\d+\b`
const MAJOR = String.raw`\b[vV]\d+(?:\.\d+)*\b`
const PINS = new RegExp([PACKAGE_PIN, IMAGE_TAG, SEMVER, MAJOR].join('|'), 'g')

/** The text after the YAML header; the whole text without one. @param {string} text */
const bodyOf = (text) => {
  const header = headerOf(text)
  return header === null ? text : text.slice(text.indexOf(header) + header.length)
}

/**
 * Each version pin of the body, once, in reading order.
 * @param {string} body
 */
const versionPins = (body) => [...new Set(body.match(PINS) ?? [])]

/**
 * What the content of an unpublished ADR breaks.
 * @param {string} path @param {string} text
 * @returns {string[]}
 */
export const contentProblems = (path, text) => [
  ...versionPins(bodyOf(text)).map((token) => `${path} names a version (${token}): name the technology or the capability it brings; versions live in the manifests`),
]
