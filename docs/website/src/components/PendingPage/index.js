import React from 'react'
import Layout from '@theme/Layout'
import Translate from '@docusaurus/Translate'

// TEMPORARY placeholder for a page the migration has not converted yet (WP0 to WP1b).
export default function PendingPage() {
  return (
    <Layout title="…">
      <main className="container margin-vert--xl">
        <h1><Translate id="skraft.pending.title">This page is being migrated</Translate></h1>
        <p><Translate id="skraft.pending.body">The handbook is moving to a new site. This page arrives with the bulk conversion.</Translate></p>
      </main>
    </Layout>
  )
}
