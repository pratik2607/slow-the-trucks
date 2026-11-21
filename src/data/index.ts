import raw from './project.json'
import type { Project } from '../engine/types'

/** The monthly table built by `npm run data` from Lumino's raw CSVs. */
export const project = raw as unknown as Project
