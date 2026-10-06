import { DEFAULT_PHASE_ORDER } from '../../domain/state-machine.mjs'
import { createStateService } from '../state-service.mjs'
import { createPhaseGate } from '../phase-gate-service.mjs'

// The state service every pipeline use case writes through: each transition passes the
// state machine and the phase gate (the gate reads the tracking files and git).
export const createPipelineStateService = ({ config, stateReader, stateWriter, trackingStore, sourceControl }) => {
  const phaseOrder = config.phaseOrder ?? DEFAULT_PHASE_ORDER
  return {
    phaseOrder,
    stateService: createStateService({
      stateReader,
      stateWriter,
      phaseOrder,
      phaseGate: createPhaseGate({ config, trackingFiles: trackingStore, git: sourceControl }),
    }),
  }
}
