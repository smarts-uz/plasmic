// This is a skeleton starter React component generated by Plasmic.
// This file is owned by you, feel free to edit as you see fit.
import { WithContextMenu } from "@/wab/client/components/ContextMenu";
import { useVariableRow } from "@/wab/client/components/sidebar-tabs/StateManagement/useVariableRow";
import { ValuePreview } from "@/wab/client/components/sidebar-tabs/data-tab";
import { LabeledListItem } from "@/wab/client/components/widgets/LabeledListItem";
import { DefaultVariableRowProps } from "@/wab/client/plasmic/plasmic_kit_state_management/PlasmicVariableRow";
import { StudioCtx } from "@/wab/client/studio-ctx/StudioCtx";
import { ViewCtx } from "@/wab/client/studio-ctx/view-ctx";
import { Component, State } from "@/wab/shared/model/classes";
import { HTMLElementRefOf } from "@plasmicapp/react-web";
import { observer } from "mobx-react";
import * as React from "react";
import { getStateVarName } from "src/wab/states";

export interface VariableRowProps extends DefaultVariableRowProps {
  component: Component;
  state: State;
  viewCtx: ViewCtx;
  sc: StudioCtx;
  defaultEditing?: boolean;
}

const VariableRow = observer(
  React.forwardRef(function VariableRow(
    props: VariableRowProps,
    ref: HTMLElementRefOf<"div">
  ) {
    const { component, state, sc, viewCtx, defaultEditing, ...rest } = props;
    const {
      menu,
      modals,
      props: variableRowProps,
    } = useVariableRow({ sc, component, state, viewCtx });

    const onEditLabel = (val) =>
      void sc.change(({ success }) => {
        if (val) {
          sc.tplMgr().renameParam(component, state.param, val);
        }
        return success();
      });

    return (
      <WithContextMenu overlay={menu}>
        <LabeledListItem
          data-test-id={getStateVarName(state)}
          data-test-type={"variable-row"}
          ref={ref}
          valueSetState={variableRowProps.hasTempValue ? "isSet" : undefined}
          label={variableRowProps.name}
          onClick={variableRowProps.showVariableConfigModal}
          menu={menu}
          value={
            <ValuePreview
              onClick={variableRowProps.showValueConfigModal}
              val={variableRowProps.value}
            />
          }
          {...rest}
        >
          <ValuePreview
            onClick={variableRowProps.showValueConfigModal}
            val={variableRowProps.value}
          />
        </LabeledListItem>
        {modals}
      </WithContextMenu>
    );
  })
);

export default VariableRow;
