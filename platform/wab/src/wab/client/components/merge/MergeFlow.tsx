// This is a skeleton starter React component generated by Plasmic.
// This file is owned by you, feel free to edit as you see fit.
import { apiKey, invalidationKey } from "@/wab/client/api";
import Conflict from "@/wab/client/components/merge/Conflict";
import Diffs from "@/wab/client/components/merge/Diffs";
import LineItem from "@/wab/client/components/merge/LineItem";
import { objIcon, SiteDiffs } from "@/wab/client/components/modals/SiteDiffs";
import { createNodeIcon } from "@/wab/client/components/sidebar-tabs/tpl-tree";
import { TopBarModal } from "@/wab/client/components/TopFrame/TopBar/TopBarModal";
import { MergeModalContext } from "@/wab/client/components/TopFrame/TopFrameChrome";
import { Spinner } from "@/wab/client/components/widgets";
import { useAppCtx } from "@/wab/client/contexts/AppContexts";
import { reportSilentErrorMessage } from "@/wab/client/ErrorNotifications";
import { useTopFrameCtx } from "@/wab/client/frame-ctx/top-frame-ctx";
import {
  DefaultMergeFlowProps,
  PlasmicMergeFlow,
} from "@/wab/client/plasmic/plasmic_kit_merge_flow/PlasmicMergeFlow";
import {
  ensure,
  ensureType,
  mkUuid,
  spawn,
  spawnWrapper,
  tuple,
  withoutNils,
  xGroupBy,
} from "@/wab/common";
import { getComponentDisplayName } from "@/wab/components";
import { ApiBranch, ApiProject, MergeResult } from "@/wab/shared/ApiSchema";
import { isMainBranchId } from "@/wab/shared/ApiSchemaUtil";
import { FastBundler } from "@/wab/shared/bundler";
import { getBundle } from "@/wab/shared/bundles";
import { EffectiveVariantSetting } from "@/wab/shared/effective-variant-setting";
import {
  isKnownComponent,
  isKnownGlobalVariantGroupParam,
  isKnownPropParam,
  isKnownSlotParam,
  isKnownStateChangeHandlerParam,
  isKnownStateParam,
  ObjInst,
  ProjectDependency,
  TplNode,
} from "@/wab/shared/model/classes";
import {
  compareSites,
  maybeMkSemVerSiteElement,
} from "@/wab/shared/site-diffs";
import {
  AutoReconciliation,
  AutoReconciliationOfDuplicateNames,
  BranchSide,
  DirectConflictPickMap,
  keyPathGet,
  matchAllGroupings,
  tryMerge,
} from "@/wab/shared/site-diffs/merge-core";
import { ensureBaseVariantSetting } from "@/wab/shared/Variants";
import { capitalizeFirst } from "@/wab/strs";
import { unbundleProjectDependency, unbundleSite } from "@/wab/tagged-unbundle";
import { isTplVariantable } from "@/wab/tpls";
import { HTMLElementRefOf } from "@plasmicapp/react-web";
import { notification } from "antd";
import { observer } from "mobx-react";
import * as React from "react";
import { ReactElement, useEffect, useState } from "react";
import useSWR, { mutate } from "swr";

interface MergeModalWrapperProps {
  project: ApiProject;
  editorPerm: boolean;
  latestPublishedVersionData:
    | { revisionId: string; version: string }
    | undefined;
  revisionNum: number;
  mergeModalContext: MergeModalContext | undefined;
  setMergeModalContext: (val: MergeModalContext | undefined) => Promise<void>;
  setShowCodeModal: (val: boolean) => Promise<void>;
}

export const MergeModalWrapper = observer(function MergeModalWrapper({
  project,
  latestPublishedVersionData,
  mergeModalContext,
  setMergeModalContext,
  setShowCodeModal,
  editorPerm,
  revisionNum,
}: MergeModalWrapperProps) {
  return (
    <>
      {mergeModalContext && (
        <TopBarModal onClose={() => setMergeModalContext(undefined)}>
          <div className={"flex-col flex-stretch-items"} style={{ width: 500 }}>
            <MergeFlow
              latestPublishedVersionData={latestPublishedVersionData}
              project={project}
              mergeModalContext={mergeModalContext}
              setMergeModalContext={setMergeModalContext}
              setShowCodeModal={setShowCodeModal}
              editorPerm={editorPerm}
              revisionNum={revisionNum}
            />
          </div>
        </TopBarModal>
      )}
    </>
  );
});

export interface MergeFlowProps
  extends DefaultMergeFlowProps,
    MergeModalWrapperProps {
  mergeModalContext: MergeModalContext;
}

function MergeFlow_(
  {
    project,
    latestPublishedVersionData,
    mergeModalContext: { subject },
    setMergeModalContext,
    setShowCodeModal,
    editorPerm,
    revisionNum,
    ...props
  }: MergeFlowProps,
  ref: HTMLElementRefOf<"div">
) {
  const appCtx = useAppCtx();
  const api = appCtx.api;
  const projectId = project.id;
  const { hostFrameApi } = useTopFrameCtx();

  const { fromBranchId, toBranchId } = subject;
  const { data, error } = useSWR(
    invalidationKey(`theFullMerge`, projectId, revisionNum),
    async () => {
      const { branches } = await api.listBranchesForProject(projectId);
      const fromSiteResponse = await api.getSiteInfo(projectId, {
        branchId: isMainBranchId(fromBranchId) ? undefined : fromBranchId,
      });
      const toSiteResponse = await api.getSiteInfo(projectId, {
        branchId: isMainBranchId(toBranchId) ? undefined : toBranchId,
      });
      const pretendMergeResult = await api.tryMergeBranch({
        subject,
        pretend: true,
        autoCommitOnToBranch: !!toBranchId,
      });

      const ancestorPkgVersion = await api.getPkgVersion(
        pretendMergeResult.pkgId,
        pretendMergeResult.ancestorPkgVersionString,
        pretendMergeResult.ancestorPkgVersionBranchId ?? undefined
      );
      const bundler = new FastBundler();
      const ancestorSite = unbundleProjectDependency(
        bundler,
        ancestorPkgVersion.pkg,
        ancestorPkgVersion.depPkgs
      ).projectDependency.site;
      const { site: fromSite } = unbundleSite(
        bundler,
        `from-${projectId}`,
        getBundle(fromSiteResponse.rev, appCtx.lastBundleVersion),
        fromSiteResponse.depPkgs
      );
      const { site: toSite } = unbundleSite(
        bundler,
        `to-${projectId}`,
        getBundle(toSiteResponse.rev, appCtx.lastBundleVersion),
        toSiteResponse.depPkgs
      );

      const mergedUuid = mkUuid();

      const mergedSite = (
        bundler.unbundle(
          ancestorPkgVersion.pkg.model,
          mergedUuid
        ) as ProjectDependency
      ).site;

      const mergeStep = tryMerge(
        ancestorSite,
        fromSite,
        toSite,
        mergedSite,
        bundler,
        undefined
      );
      const commitGraph = ensure(
        fromSiteResponse?.project.extraData.commitGraph,
        "By the time we get to merge, we should have already created commits (for creating branches)"
      );
      return {
        ancestorPkgVersion,
        bundler,
        branches,
        fromSiteResponse,
        toSiteResponse,
        pretendMergeResult,
        mergeStep,
        commitGraph,
        ancestorSite,
        fromSite,
        toSite,
        mergedUuid,
        mergedSite,
      };
    },
    {
      revalidateOnMount: true,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
      revalidateOnFocus: false,
    }
  );

  const [showAll, setShowAll] = useState(false);
  const [picks, setPicks] = useState<Record<string, BranchSide>>({});
  const [isMerging, setIsMerging] = useState(false);

  const [mode, setMode] = useState<
    "main" | "source branch changes" | "destination branch changes"
  >("main");

  useEffect(() => {
    if (
      data?.pretendMergeResult.status ===
      "uncommitted changes on destination branch"
    ) {
      notification.error({
        ...friendlyMergeResultDisplays[pretendMergeResult.status],
        duration: 0,
      });
    }
  }, [data?.pretendMergeResult.status]);

  if (!data) {
    return (
      <PlasmicMergeFlow
        loading
        spinnerContainer={{
          children: error ? (
            <div className="text-center">
              Oops! Unexpected error loading the request. <br /> <br />
              Please try again later
            </div>
          ) : (
            <Spinner />
          ),
        }}
      />
    );
  }

  const {
    ancestorPkgVersion,
    bundler,
    branches,
    fromSiteResponse,
    toSiteResponse,
    pretendMergeResult,
    mergeStep,
    commitGraph,
    ancestorSite,
    fromSite,
    toSite,
    mergedUuid,
    mergedSite,
  } = data;

  const groupedReconciliations = xGroupBy(
    mergeStep.autoReconciliations,
    (item) => {
      return item.violation === "duplicate-names" &&
        isKnownComponent(item.mergedParent)
        ? item.mergedParent.uuid
        : "";
    }
  );

  const fromBranch = branches.find((branch) => branch.id === fromBranchId);
  const toBranch = branches.find((branch) => branch.id === toBranchId);

  function describeBranch(branch: ApiBranch | undefined, capitalize: boolean) {
    return `${capitalize ? "The" : "the"} "${branch?.name ?? "main"}" branch`;
  }

  const successDescription = `${describeBranch(
    toBranch,
    true
  )} has been updated. ${
    !isMainBranchId(fromBranchId)
      ? `${describeBranch(fromBranch, true)} has been archived.`
      : ""
  }`;
  const friendlyMergeResultDisplays: Record<
    MergeResult["status"],
    { message: string; description?: string; success?: boolean }
  > = {
    "can be merged": {
      success: true,
      message: "Successfully auto-merged",
      description: successDescription,
    },
    "concurrent destination branch changes during merge": {
      message: `${describeBranch(
        toBranch,
        true
      )} got changed since merge started`,
      description:
        "Someone else changed the branch since you started this merge. Please cancel out and try the merge again.",
    },
    "concurrent source branch changes during merge": {
      message: `${describeBranch(
        fromBranch,
        true
      )} got changed since merge started`,
      description:
        "Someone else changed the branch since you started this merge. Please cancel out and try the merge again.",
    },
    "has conflicts": {
      message: "Conflicts detected",
      description:
        "There are unresolved conflicts between the branches. Please resolve all conflicts.",
    },
    "resolution accepted": {
      success: true,
      message: "Successfully merged",
      description: successDescription,
    },
    "uncommitted changes on destination branch": {
      message: `${describeBranch(toBranch, true)} has unpublished changes`,
      description:
        "Can only merge into a branch that does not have any changes since its last publish. Please publish the branch, or roll back the branch to the last publish.",
    },
    "app host mismatch": {
      success: false,
      message: "Incompatible host apps",
      description:
        "The branches have different app hosts. This means they might have different registered code components or props. Make sure to update both branches to have the appropriate host app and double check the registered components before merging.",
    },
  };

  const genericPairedChanges =
    mergeStep.status === "needs-resolution"
      ? mergeStep.genericDirectConflicts.map((conf, i) => ({
          ...conf,
          index: i,
          mergeStatus: "none",
          renamed: false,
        }))
      : [];

  const specialPairedChanges =
    mergeStep.status === "needs-resolution"
      ? mergeStep.specialDirectConflicts.map((conf, i) => ({
          ...conf,
          index: genericPairedChanges.length + i,
          mergeStatus: "none",
          renamed: false,
        }))
      : [];

  function getTypeName(typeName: string, mergedInst: ObjInst) {
    if (isKnownStateParam(mergedInst)) {
      return "State";
    }
    if (isKnownStateChangeHandlerParam(mergedInst)) {
      return "State change handler";
    }
    if (isKnownPropParam(mergedInst)) {
      return "Prop";
    }
    if (isKnownSlotParam(mergedInst)) {
      return "Slot";
    }
    if (isKnownGlobalVariantGroupParam(mergedInst)) {
      return "Global variant group";
    }
    if (isKnownComponent(mergedInst) && mergedInst.type === "page") {
      return "Page";
    }
    return typeName;
  }

  function renderReconciliationGroup(
    recs: AutoReconciliation[],
    mergedParent: AutoReconciliationOfDuplicateNames["mergedParent"]
  ): ReactElement | null {
    return (
      <>
        <p style={{ marginTop: 20, paddingLeft: 10 }}>
          {isKnownComponent(mergedParent) ? (
            <>
              <strong>{getComponentDisplayName(mergedParent)}</strong>{" "}
              {mergedParent.type === "page" ? "page" : "component"}{" "}
            </>
          ) : (
            ""
          )}
        </p>
        <div style={{ marginLeft: 20 }}>{recs.map(renderReconciliation)}</div>
      </>
    );
  }

  function renderReconciliation(rec: AutoReconciliation): ReactElement | null {
    const semverItem = maybeMkSemVerSiteElement(rec.mergedInst);

    if (!semverItem) {
      reportSilentErrorMessage(
        "Unexpected: Trying to render reconciliation on objects that are not valid semver elements"
      );
      return null;
    }
    const tplIcon =
      semverItem.type === "Element"
        ? createNodeIcon(
            rec.mergedInst as TplNode,
            isTplVariantable(rec.mergedInst)
              ? new EffectiveVariantSetting(rec.mergedInst, [
                  ensureBaseVariantSetting(rec.mergedInst),
                ])
              : undefined
          )
        : undefined;

    const typeName = getTypeName(semverItem.type, rec.mergedInst);
    switch (rec.violation) {
      case "duplicate-names":
        return (
          <LineItem icon={objIcon(semverItem, tplIcon)}>
            <span>
              {typeName} <strong>{rec.origName}</strong> exists in both
              versions. <br />
              We renamed yours to <strong>{rec.renamedTo}</strong>
            </span>
          </LineItem>
        );
      case "duplicate-page-path":
        return (
          <LineItem icon={objIcon(semverItem)}>
            <span>
              Page <strong>{getComponentDisplayName(rec.mergedInst)}</strong> (
              <code>{rec.origPath}</code>) has a conflicting path, so we renamed
              it to <code>{rec.newPath}</code>
            </span>
          </LineItem>
        );
    }
  }
  // Find the nearest grouping and use its label / name functions
  const pairedChangesConfs = [
    ...specialPairedChanges,
    ...genericPairedChanges,
  ].map((change) => {
    const path =
      change.conflictType === "generic"
        ? change.leftRootPath
        : JSON.parse(change.pathStr);
    const descriptionsAndTypes = withoutNils(
      [...matchAllGroupings(path)].map(({ grouping, key }, i) => {
        const isFirst = i === 0;
        if (!grouping.name && !isFirst) {
          return null;
        }
        const leftInst = keyPathGet(
          fromSite,
          path.slice(0, key.length),
          bundler
        );
        const rightInst = keyPathGet(
          toSite,
          path.slice(0, key.length),
          bundler
        );
        const label = grouping.label(leftInst, fromSite, rightInst, toSite);
        const semverItem = maybeMkSemVerSiteElement(leftInst);
        const labelPart = isFirst ? capitalizeFirst(label) : "of " + label;
        if (!grouping.name) {
          return tuple(labelPart + " ", semverItem);
        }
        const name = grouping.name?.(leftInst, fromSite, rightInst, toSite);
        return tuple(
          <>
            {labelPart} <strong>{name}</strong>{" "}
          </>,
          semverItem
        );
      })
    );

    const innermostIcon =
      withoutNils(
        descriptionsAndTypes.map(([_, semverItem]) =>
          semverItem && semverItem.type !== "Element"
            ? objIcon(semverItem)
            : undefined
        )
      )[0] ?? null;

    return (
      <Conflict
        merged={change.mergeStatus == "full"}
        hasSubtext={change.mergeStatus === "partial" || !!change.renamed}
        icon={innermostIcon}
        name={
          <span className="wrap-word">
            {descriptionsAndTypes.map(([description]) => description)}
          </span>
        }
        subtext={[
          change.mergeStatus === "partial" && `Some changes were auto-merged.`,
          change.renamed && `Main branch renamed to ${change.renamed}.`,
        ]
          .filter(Boolean)
          .join(" ")}
        side={picks[change.index] ?? "left"}
        onPickSide={(side) =>
          setPicks({
            ...picks,
            [change.index]: side,
          })
        }
      />
    );
  });

  const canMerge =
    pretendMergeResult.status !== "uncommitted changes on destination branch" &&
    pretendMergeResult.status !== "app host mismatch";

  switch (mode) {
    case "main":
      return (
        <PlasmicMergeFlow
          root={{ ref }}
          {...props}
          blocked={pretendMergeResult.status === "app host mismatch"}
          mergeBlockedTitle={
            pretendMergeResult.status === "app host mismatch"
              ? {
                  wrapChildren: (children) => (
                    <>
                      {children}
                      {" - "}
                      {
                        friendlyMergeResultDisplays[pretendMergeResult.status]
                          .message
                      }
                    </>
                  ),
                }
              : undefined
          }
          mergeBlockedMsg={
            pretendMergeResult.status === "app host mismatch"
              ? {
                  children:
                    friendlyMergeResultDisplays[pretendMergeResult.status]
                      .description,
                }
              : undefined
          }
          empty={pairedChangesConfs.length === 0}
          sourceBranchChanges={{
            onClick: () => {
              // When merging from main to a branch, we opt to keep the UI
              // stable so that local changes in this branch are always on the
              // top. So we might need to flip the values here.
              setMode(
                isMainBranchId(toBranchId)
                  ? "source branch changes"
                  : "destination branch changes"
              );
            },
          }}
          destinationBranchChanges={{
            onClick: () => {
              setMode(
                isMainBranchId(toBranchId)
                  ? "destination branch changes"
                  : "source branch changes"
              );
            },
          }}
          pairedChanges={{
            children: pairedChangesConfs,
          }}
          reconciliationsContainer={{
            wrap: (node) => mergeStep.autoReconciliations.length > 0 && node,
          }}
          reconciliations={{
            children: Array.from(groupedReconciliations.entries()).map(
              ([key, items]) => {
                if (!key) {
                  return items.map(renderReconciliation);
                }
                return renderReconciliationGroup(
                  items,
                  (items[0] as AutoReconciliationOfDuplicateNames).mergedParent
                );
              }
            ),
          }}
          showAllSwitchContainer={{
            wrap: (node) => false,
          }}
          showAllSwitch={{
            isChecked: showAll,
            onChange: () => {
              setShowAll(!showAll);
            },
          }}
          cancelButton={{
            onClick: spawnWrapper(() => setMergeModalContext(undefined)),
          }}
          finishButton={{
            disabled: !canMerge || isMerging,
            ...(isMerging ? { children: "Merging..." } : {}),
            onClick: () => {
              setIsMerging(true);
              const doMerge = async () => {
                // Apply the picks

                // First, bundle the mergedSite to ensure all the partially-auto-merged objects are serialized.
                // This might be needed by resolveGenericConflicts since it relies on bundler bookkeeping.
                bundler.bundle(
                  mergedSite,
                  mergedUuid,
                  appCtx.lastBundleVersion
                );

                // left === from and right === to in the merge-core, but
                // left === to and right === from in the UI, so this looks flipped but it's correct!
                // Also, when merging from main to a branch, we opt to keep the columns stable so that main is always on the left and branch is always on the right.
                // So we would flip yet again.

                // main is always "left", this branch is always "right"
                // main == from, then main == leftRoot
                // main == to, then main == rightRoot
                // so if we chose "right", then we chose this branch
                //   if main == from, then pick rightRoot
                //   if main == to, then pick leftRoot
                // if we chose "left", then we chose main
                //   if main == from, then pick leftRoot
                //   if main == to, then pick rightRoot

                const genericPicks = genericPairedChanges.flatMap((cf) =>
                  cf.conflictDetails.map((dt) =>
                    tuple(
                      dt.pathStr,
                      ensureType<BranchSide>(
                        picks[cf.index] === "right"
                          ? isMainBranchId(toBranchId)
                            ? "left"
                            : "right"
                          : isMainBranchId(toBranchId)
                          ? "right"
                          : "left"
                      )
                    )
                  )
                );

                const specialPicks = specialPairedChanges.flatMap((cf) => [
                  tuple(
                    cf.pathStr,
                    ensureType<BranchSide>(
                      picks[cf.index] === "right"
                        ? isMainBranchId(toBranchId)
                          ? "left"
                          : "right"
                        : isMainBranchId(toBranchId)
                        ? "right"
                        : "left"
                    )
                  ),
                ]);

                const picksMap: DirectConflictPickMap = Object.fromEntries(
                  genericPicks.concat(specialPicks)
                );

                const realMerge = await api.tryMergeBranch({
                  subject,
                  pretend: false,
                  autoCommitOnToBranch: !!toBranchId,
                  resolution:
                    pretendMergeResult.status === "has conflicts"
                      ? {
                          expectedFromRevisionNum:
                            pretendMergeResult.fromRevisionNum,
                          expectedToRevisionNum:
                            pretendMergeResult.toRevisionNum,
                          picks: picksMap,
                        }
                      : undefined,
                });
                await mutate(apiKey("listBranchesForProject", projectId));
                const display = friendlyMergeResultDisplays[realMerge.status];
                if (display.success) {
                  await hostFrameApi.switchToBranch(toBranch);
                  await setMergeModalContext(undefined);
                  notification.info(display);
                } else {
                  notification.error({ ...display, duration: 0 });
                }
              };
              spawn(
                doMerge()
                  .then(() => setIsMerging(false))
                  .catch((err) => {
                    setIsMerging(false);
                    throw err;
                  })
              );
            },
          }}
        />
      );
    case "source branch changes":
      return (
        <Diffs
          branchLabel={describeBranch(fromBranch, false)}
          onBack={() => setMode("main")}
        >
          <SiteDiffs diffs={compareSites(ancestorSite, fromSite)} />
        </Diffs>
      );
    case "destination branch changes":
      return (
        <Diffs
          branchLabel={describeBranch(toBranch, false)}
          onBack={() => setMode("main")}
        >
          <SiteDiffs diffs={compareSites(ancestorSite, toSite)} />
        </Diffs>
      );
  }
}

const MergeFlow = React.forwardRef(MergeFlow_);
export default MergeFlow;
