// Re-export shim — keep public API stable while internals live in passing/.
export { constrainPass, findReceiver, isPassLaneBlocked, calculatePassSuccess } from './passing/mechanics'
export { getOffsideLine, isOffside } from './passing/offside'
export { applyPass } from './passing/applyPass'
