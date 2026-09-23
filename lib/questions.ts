// Assessment 1 question bank access.
//
// The shuffling helpers live in ./shuffle so that importing them does not pull
// this bank into a bundle that must not contain it.
import data from '@/data/questions.json'

export const bank: any = data

export { mulberry32, shuffled, shuffledOptions, shuffledChoiceOptions, hashStr } from './shuffle'
export type { SessionRng } from './shuffle'
