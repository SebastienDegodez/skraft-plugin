---
layout: doc
lang: en
title: "Contract-testing worker"
description: "The internal subagent that emits the provider-side contract test."
sidebar_position: 1
---

# Contract-testing worker

This worker **always** emits the baseline integration test
(`WebApplicationFactory` + `HttpClient`) for this service's API. When the
Microcks opt-in is set, it **adds** the `TestEndpointAsync(OPEN_API_SCHEMA)`
verification layer on top — it never replaces the baseline.

It does not drive the business RED→GREEN cycle and it does not mock any
downstream dependency: that is the other worker.
