import { redirect } from 'next/navigation'

/** Root path redirects immediately to the welcome screen. */
export default function RootPage() {
  redirect('/inicio')
}
