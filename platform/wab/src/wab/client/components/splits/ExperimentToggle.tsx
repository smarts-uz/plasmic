// This is a skeleton starter React component generated by Plasmic.
// This file is owned by you, feel free to edit as you see fit.
import {
  DefaultExperimentToggleProps,
  PlasmicExperimentToggle,
} from "@/wab/client/plasmic/plasmic_kit_optimize/PlasmicExperimentToggle";
import { useStudioCtx } from "@/wab/client/studio-ctx/StudioCtx";
import { spawn } from "@/wab/common";
import { Split } from "@/wab/shared/model/classes";
import { SplitStatus } from "@/wab/splits";
import { HTMLElementRefOf } from "@plasmicapp/react-web";
import { observer } from "mobx-react";
import * as React from "react";

// Your component props start with props for variants and slots you defined
// in Plasmic, but you can add more here, like event handlers that you can
// attach to named nodes in your component.
//
// If you don't want to expose certain variants or slots as a prop, you can use
// Omit to hide them:
//
// interface ExperimentToggleProps extends Omit<DefaultExperimentToggleProps, "hideProps1"|"hideProp2"> {
//   // etc.
// }
//
// You can also stop extending from DefaultExperimentToggleProps altogether and have
// total control over the props for your component.
export interface ExperimentToggleProps extends DefaultExperimentToggleProps {
  split: Split;
}

function ExperimentToggle_(
  props: ExperimentToggleProps,
  ref: HTMLElementRefOf<"div">
) {
  const { split } = props;
  const studioCtx = useStudioCtx();

  return (
    <PlasmicExperimentToggle
      root={{ ref }}
      checked={split.status === SplitStatus.Running}
      onClick={() => {
        spawn(
          studioCtx.change(({ success }) => {
            if (split.status !== SplitStatus.Running) {
              split.status = SplitStatus.Running;
            } else {
              split.status = SplitStatus.Stopped;
            }
            return success();
          })
        );
      }}
    />
  );
}

const ExperimentToggle = observer(React.forwardRef(ExperimentToggle_));
export default ExperimentToggle;
