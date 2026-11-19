/** Stable form values shared by the card renderer and durable submission service. */
export type FormValues = Record<string, string | boolean>

/** A persisted card is independent from the chat composer's unsent draft. */
export interface CardState {
  values: FormValues
  status: 'draft' | 'pending' | 'submitted'
  revision: number
}
