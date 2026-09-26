---
layout: doc
lang: en
title: "Mock-integration worker"
description: "The internal subagent that mocks the downstream dependency the system under test calls."
sidebar_position: 2
---

# Mock-integration worker

This worker resolves a mocking strategy (`microcks` by default, `inprocess` as
an override) crossed with the stack, then emits the downstream mock wiring and
the integration-test scaffold.

It does not drive the business RED→GREEN cycle and it does not verify a
provider-side contract: that is the other worker.
