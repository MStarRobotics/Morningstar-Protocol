// Noop stub for @veramo/credential-ld
// The real package pulls in elliptic (vulnerable, no fix available).
// JWT credential support via @veramo/credential-w3c still works without this.
// LD-based credential support is handled by @digitalcredentials/vc instead.
module.exports = {};
