---
title: Release notes with fixed and known issues in Azure Local
description: Read about the known issues and fixed issues in Azure Local.
author: ronmiab
ms.author: robess
ms.topic: troubleshooting-general
ms.date: 10/20/2026
ms.subservice: hyperconverged
---

# Known issues in Azure Local

This article identifies critical known issues and their workarounds in Azure Local.

These release notes are continuously updated, and as critical issues requiring a workaround are discovered, they're added. Before you deploy your Azure Local instance, carefully review the information contained here.

> [!IMPORTANT]
> For information about supported update paths for this release, see [Release information](./release-information-23h2.md#about-azure-local-releases).

For more information about new features in this release, see [What's new for Azure Local](whats-new.md).

::: moniker range="=azloc-2610"

## Known issues for version 2610

For the 2610 release of Azure Local, Microsoft released the following update:

| Solution version | OS build |
| -- | -- |
| 12.2610.1004.41 | 26100.33650 |

> [!IMPORTANT]
> New deployments of this software use the **12.2610.1004.41** build.
The release notes for this version include the issues fixed in this release, known issues in this release, and known issues carried over from previous versions.

> [!NOTE]
> For detailed remediation for common known issues, see the [Azure Local Supportability](https://github.com/Azure/AzureStackHCI-Supportability) GitHub repository.

## Fixed issues

The following table lists the fixed issues in this release:

| Feature | Issue | Comments | Solution version |
| ------ | ------ | ------- | -------- |
| Azure Local VMs <!--38675829--> | The `az stack-hci-vm stop` command can fail when used with Azure Local clusters running releases earlier than 2604. | The stop command now maintains backward compatibility with pre-2604 clusters. | 12.2610.1004.41 |
| Azure Local VMs <!--39447415--> | Managed identity sign-in for Azure Local VMs can fail in Azure Government because the cloud environment isn't selected correctly. | Managed identity sign-in now uses the correct Azure Government environment. | 12.2610.1004.41 |
| Azure Local VMs <!--39460649--> | VM image operations can fail when a repository value produces a malformed image path containing a double slash. | Image paths are now normalized so repository values resolve correctly. | 12.2610.1004.41 |
| Azure Local VMs <!--39494296--> | Arc enablement for Azure Local VMs can fail in sovereign clouds because required service endpoint and certificate settings are missing. | Sovereign-cloud endpoint and certificate settings are now applied so VMs can be Arc-enabled. | 12.2610.1004.41 |
| Azure Local VMs <!--39804995--> | The Windows guest agent can remain stopped after an update, interrupting guest management operations. | The update flow now keeps the guest agent running after the update completes. | 12.2610.1004.41 |
| Deployment and node lifecycle <!--35520442--> | Corruption-diagnostic telemetry can be missing for deployment packages whose names contain digits. | Corruption-diagnostic telemetry now includes these packages to help support investigate package corruption. | 12.2610.1004.41 |
| Deployment and node lifecycle <!--37490414--> | An existing Azure Local instance can fail to start an upgrade because valid Active Directory administrator credentials are incorrectly rejected. | Valid Active Directory administrator credentials are now accepted so the upgrade can start. | 12.2610.1004.41 |
| Deployment and node lifecycle <!--37706162--> | Deployment logs can omit package-extraction details needed to diagnose deployment failures. | Deployment logs now include package-extraction details to help support identify the affected package. | 12.2610.1004.41 |
| Deployment and node lifecycle <!--38531801--> | Storage Spaces Direct cache configuration can result in unsupported cache settings and unclaimed cache disks on all-flash and hybrid clusters during deployment and node repair. | Cache configuration now uses supported settings and correctly claims cache disks during deployment and node repair. | 12.2610.1004.41 |
| Deployment and node lifecycle <!--39175932--> | Deployment status can hide the failed validation step and its error details. | Deployment status now shows the failed validation step and its error details to help identify and resolve deployment blockers. | 12.2610.1004.41 |
| Deployment and node lifecycle <!--39269310--> | Validation checks that take longer than 30 minutes can prematurely block adding or repairing a node. | Validation now allows up to 60 minutes for checks to complete when adding or repairing a node. | 12.2610.1004.41 |
| Deployment and node lifecycle <!--39546687--> | Inconsistent regional settings across deployment accounts and nodes can be difficult to diagnose when culture-related validation failures occur. | Informational checks and logging now identify inconsistent regional settings earlier without blocking deployment. | 12.2610.1004.41 |
| Storage health <!--36838270--> | Truncated supported-drive information can cause supported replacement drives or drives on newly added nodes to be incorrectly quarantined. | Supported-drive information is now retained in full so supported drives aren't incorrectly quarantined. | 12.2610.1004.41 |
| Storage health <!--38474270--> | Entering storage maintenance mode with unhealthy virtual disks can retry indefinitely, causing node-drain failures or stalling firmware servicing. | Storage maintenance mode no longer retries indefinitely when virtual disks are unhealthy. | 12.2610.1004.41 |
| Network lifecycle <!--38802899--> | Network Controller dependency-loading failures during solution updates can disrupt software-defined networking, causing loss of workload connectivity and network security policy enforcement. | Network Controller dependencies now load correctly during solution updates, preserving connectivity and network security policy enforcement. | 12.2610.1004.41 |
| Network lifecycle <!--38891739--> | Incorrect reporting of Network Controller pre-update health checks can delay detection of SDN service problems. | Pre-update health checks now correctly report Network Controller health so SDN service problems are visible earlier. | 12.2610.1004.41 |
| Hardware and Solution Builder Extension <!--37935046--> | Missing-command errors can prevent third-party Cluster-Aware Updating integrations from completing SBE update operations. | Required commands are now available so third-party Cluster-Aware Updating integrations can complete SBE updates. | 12.2610.1004.41 |
| Hardware and Solution Builder Extension <!--37942539--> | A missing health-check output directory can cause a cluster to be reported as unhealthy after a successful SBE update, blocking subsequent updates. | The health-check output directory is now available so successful SBE updates don't cause false unhealthy reports or block subsequent updates. | 12.2610.1004.41 |
| Hardware and Solution Builder Extension <!--38815387--> | Updates can reset SBE credential locations, partner settings, and VM failback preferences, requiring manual reconfiguration. | Updates now preserve SBE credential locations, partner settings, and VM failback preferences. | 12.2610.1004.41 |
| Hardware and Solution Builder Extension <!--38916629--> | Blank entries in partner download responses can cause HPE SBE downloads to fail. | Blank entries are now handled so valid HPE SBE downloads can proceed without manual patching. | 12.2610.1004.41 |
| Hardware and Solution Builder Extension <!--39045186--> | Stale retry counts from a previous OS update can immediately block subsequent updates with a maximum-retries error. | Retry counts from previous OS updates no longer cause subsequent updates to be prematurely blocked. | 12.2610.1004.41 |
| Hardware and Solution Builder Extension <!--39556059--> | Driver installation can continue retrying after reaching the retry limit, leaving Cluster-Aware Updating stuck in an installation loop. | Driver installation now stops at the retry limit so Cluster-Aware Updating can report the failure. | 12.2610.1004.41 |
| Security and Active Directory <!--38891971--> | Cluster creation can fail when the deployment organizational unit contains inherited Active Directory permissions. | Cluster creation now preserves inherited Active Directory permissions while granting the cluster the access it needs. | 12.2610.1004.41 |
| Update orchestration <!--37539622--> | Multiple solution updates can start or resume simultaneously, causing conflicting update operations and failures. | Solution updates can no longer start or resume simultaneously, preventing conflicting update operations. | 12.2610.1004.41 |
| Update orchestration <!--37738500--> | Duplicate concurrent update requests can overwhelm update management services, causing hangs and timeouts. | Duplicate concurrent update requests are now prevented so they don't overwhelm update management services. | 12.2610.1004.41 |
| Update orchestration <!--39270929--> | Retry evaluation after an OS update leaves nodes on an unexpected version can produce a misleading file-path error that masks the actual update condition. | Retry evaluation now handles unexpected node versions without masking the update condition with a misleading file-path error. | 12.2610.1004.41 |
| Arc-enabled virtual machines <!--39230146--> | Stale Arc Resource Bridge health alerts after health-check ownership moves between nodes can incorrectly block updates on a healthy cluster. | Arc Resource Bridge health alerts now reflect current health after ownership moves between nodes, preventing stale alerts from blocking updates. | 12.2610.1004.41 |

## Known issues

There are no known issues specific to this release. For known issues from previous releases, see the [Known issues from previous releases](#known-issues-from-previous-releases) section.

<!--|Feature  |Issue    |Workaround |
|---------|---------|---------|-->

## Known issues from previous releases

The following table lists known issues from previous releases:

| Feature | Issue | Workaround |
| --------- | --------- | --------- |
| Azure Local VMs <!--30775126--> | The `az stack-hci-vm stop` command fails when using CLI version 1.14.x against clusters running versions prior to 2604. | Use the latest CLI and include the `--skip-shutdown` parameter to force a turn off (`az stack-hci-vm stop --skip-shutdown`). Alternatively, downgrade to an earlier CLI version (1.13.0 or earlier) where the default stop behavior is supported on all clusters. |
| Windows Admin Center <!--60836305--> | Instances of Windows Admin Center with installed versions of Cluster Manager lower than 5.2.6 might experience problems with volume deletion operations. | To prevent data loss, update the Cluster manager extension to version 5.2.6 or ensure you're using Windows Admin Center version 2511 build 2.6.6.18 or higher. Don't delete your volumes in Windows Admin Center unless the Cluster manager extension is updated. |
| Update <!--36808734--> | During the update, health checks might report the error: `SBE manifest endpoint not reported by Get-SolutionDiscoveryDiagnosticInfo`. | This error is at the warning level. You can ignore it while running the update. |
| Deployment <!--33008717--> | In this release and previous releases, registration fails with the following error when you try to register Azure Local machines with Azure Arc: <br>`AZCMAgent command failed with error: >> exitcode: 42. Additional Info: See https://aka.ms/arc/azcmerror`. | For detailed steps on how to resolve this issue, see the [Troubleshooting guide](https://github.com/Azure/AzureLocal-Supportability/blob/main/TSG/ArcRegistration/TSG-Arc-registration-failing-with-error-42.md). |
| Azure Local VM management | The Mochostagent service might appear to be running but can get stuck without updating logs for over a month. You can identify this issue by checking the service logs in `C:\programdata\mochostagent\logs` to see if logs are being updated. | Run the following command to restart the mochostagent service: `restart-service mochostagent`. |
| Update | When you view the readiness check results for an Azure Local instance via the Azure Update Manager, there might be multiple readiness checks with the same name. | There's no known workaround in this release. Select **View details** to view specific information about the readiness check. |
| Update | There's an intermittent issue in this release when the Azure portal incorrectly reports the update status as **Failed to update** or **In progress** though the update is complete. | [Connect to your Azure Local instance](./update/update-via-powershell-23h2.md#connect-to-your-azure-local) via a remote PowerShell session. To confirm the update status, run the following PowerShell cmdlets: <br><br> `$Update = get-solutionupdate`\| `? version -eq "<version string>"`<br><br>Replace the version string with the version you're running. For example, "10.2405.0.23". <br><br>`$Update.state`<br><br>If the update status is **Installed**, no further action is required. The Azure portal refreshes the status correctly within 24 hours. <br> To refresh the status sooner, follow these steps on one of the nodes. <br>Restart the Cloud Management cluster group.<br>`Stop-ClusterGroup "Cloud Management"`<br>`Start-ClusterGroup "Cloud Management"` |
| Azure portal <!--25741164--> | In some instances, the Azure portal takes a while to update and the view might not be current. | You might need to wait for 30 minutes or more to see the updated view. |
| Security <!--30348397--> | Azure Local might face an issue during normal operations (for example, Update, Repair) while using Defender for Endpoint and when the **Restrict App Execution** setting is enabled for one or more servers in the deployment. | Disable the **Restrict App Execution** setting in the Defender portal and reboot. If the issue persists, [open a support case](/azure/azure-portal/supportability/how-to-create-azure-support-request). |
| Deployment <!--33390832--> | In rare instances, deployment fails with errors during validation that state that the mandatory Arc extensions aren't yet installed. | If you face this issue, retry the deployment. |
| Security | If the Windows Defender attack surface reduction rule Block Process Creations originating from PSExec & WMI commands is configured to Block, the Azure Local Solution Update fails to run. | For detailed steps on how to resolve this issue, see the [Troubleshooting guide](https://github.com/Azure/AzureLocal-Supportability/blob/main/TSG/Update/Solution-Update-CAU-Run-fails-due-to-Windows-Defender-blocking-WMI-commands.md). |
| Add server, Repair server <!--35816797--> | Add node and repair node operations fail when running on 11.2510.1002.87 or 12.2510.1002.88, as these images were recalled and don't exist. | Upgrade your environment to 11.2510.1002.93 or 12.2510.1002.94. <br><br> If you need to run add node or repair node operations during the update from 1.2510.1002.87/12.2510.1002.88 to 11.2510.1002.93/12.2510.1002.94, [open a support case](/azure/azure-portal/supportability/how-to-create-azure-support-request) to overwrite the image validation. |
| Update <!--36360771--> | Fetching the secret rotation action plan status fails. | The secret rotation completes successfully, so you can ignore the failure message. |

::: moniker-end

::: moniker range="=azloc-2609"

## Known issues for version 2609

For the 2609 release of Azure Local, Microsoft released the following update:

| Solution version | OS build |
| -- | -- |
| 12.2609.1003.7 | 26100.33438 |

> [!IMPORTANT]
> New deployments of this software use the **12.2609.1003.7** build.
The release notes for this version include the issues fixed in this release, known issues in this release, and known issues carried over from previous versions.

> [!NOTE]
> For detailed remediation for common known issues, see the [Azure Local Supportability](https://github.com/Azure/AzureStackHCI-Supportability) GitHub repository.

## Fixed issues

The following table lists the fixed issues in this release:

| Feature | Issue | Comments | Solution version |
| ------ | ------ | ------- | -------- |
| Azure Local VMs <!--38675823--> | On Azure Local clusters earlier than version 2604, `az stack-hci-vm stop` can fail when stopping a running VM with the error "Cannot do StopGraceful power operation on a Running VM." | The stop command now remains compatible with clusters earlier than version 2604, so you can stop running VMs without this error. | 12.2609.1003.7 |
| Azure Local VMs <!--32094767--> | Some clusters were being billed for Azure Machine Configuration, when it should be free for Azure Local customers. | This issue is resolved in the August 2026 release of the Azure Machine Configuration agent. For more details, see the [agent release notes](/azure/azure-arc/servers/agent-release-notes#version-167---august-2026). | 12.2609.1003.7 |

## Known issues

There are no known issues specific to this release. For known issues from previous releases, see the [Known issues from previous releases](#known-issues-from-previous-releases) section.

<!--|Feature  |Issue    |Workaround |
|---------|---------|---------|-->

## Known issues from previous releases

The following table lists known issues from previous releases:

| Feature | Issue | Workaround |
| --------- | --------- | --------- |
| Azure Local VMs <!--30775126--> | The `az stack-hci-vm stop` command fails when using CLI version 1.14.x against clusters running versions prior to 2604. | Use the latest CLI and include the `--skip-shutdown` parameter to force a turn off (`az stack-hci-vm stop --skip-shutdown`). Alternatively, downgrade to an earlier CLI version (1.13.0 or earlier) where the default stop behavior is supported on all clusters. |
| Windows Admin Center <!--60836305--> | Instances of Windows Admin Center with installed versions of Cluster Manager lower than 5.2.6 might experience problems with volume deletion operations. | To prevent data loss, update the Cluster manager extension to version 5.2.6 or ensure you're using Windows Admin Center version 2511 build 2.6.6.18 or higher. Don't delete your volumes in Windows Admin Center unless the Cluster manager extension is updated. |
| Update <!--36808734--> | During the update, health checks might report the error: `SBE manifest endpoint not reported by Get-SolutionDiscoveryDiagnosticInfo`. | This error is at the warning level. You can ignore it while running the update. |
| Deployment <!--33008717--> | In this release and previous releases, registration fails with the following error when you try to register Azure Local machines with Azure Arc: <br>`AZCMAgent command failed with error: >> exitcode: 42. Additional Info: See https://aka.ms/arc/azcmerror`. | For detailed steps on how to resolve this issue, see the [Troubleshooting guide](https://github.com/Azure/AzureLocal-Supportability/blob/main/TSG/ArcRegistration/TSG-Arc-registration-failing-with-error-42.md). |
| Azure Local VM management | The Mochostagent service might appear to be running but can get stuck without updating logs for over a month. You can identify this issue by checking the service logs in `C:\programdata\mochostagent\logs` to see if logs are being updated. | Run the following command to restart the mochostagent service: `restart-service mochostagent`. |
| Update | When you view the readiness check results for an Azure Local instance via the Azure Update Manager, there might be multiple readiness checks with the same name. | There's no known workaround in this release. Select **View details** to view specific information about the readiness check. |
| Update | There's an intermittent issue in this release when the Azure portal incorrectly reports the update status as **Failed to update** or **In progress** though the update is complete. | [Connect to your Azure Local instance](./update/update-via-powershell-23h2.md#connect-to-your-azure-local) via a remote PowerShell session. To confirm the update status, run the following PowerShell cmdlets: <br><br> `$Update = get-solutionupdate`\| `? version -eq "<version string>"`<br><br>Replace the version string with the version you're running. For example, "10.2405.0.23". <br><br>`$Update.state`<br><br>If the update status is **Installed**, no further action is required. The Azure portal refreshes the status correctly within 24 hours. <br> To refresh the status sooner, follow these steps on one of the nodes. <br>Restart the Cloud Management cluster group.<br>`Stop-ClusterGroup "Cloud Management"`<br>`Start-ClusterGroup "Cloud Management"` |
| Azure portal <!--25741164--> | In some instances, the Azure portal might take a while to update and the view might not be current. | You might need to wait for 30 minutes or more to see the updated view. |
| Security <!--30348397--> | Azure Local might face an issue during normal operations (for example, Update, Repair) while using Defender for Endpoint and when the **Restrict App Execution** setting is enabled for one or more servers in the deployment. | Disable the **Restrict App Execution** setting in the Defender portal and reboot. If the issue persists, [open a support case](/azure/azure-portal/supportability/how-to-create-azure-support-request). |
| Deployment <!--33390832--> | In rare instances, deployment fails with errors during validation that state that the mandatory Arc extensions aren't yet installed. | If you face this issue, retry the deployment. |
| Security | If the Windows Defender attack surface reduction rule Block Process Creations originating from PSExec & WMI commands is configured to Block, the Azure Local Solution Update fails to run. | For detailed steps on how to resolve this issue, see the [Troubleshooting guide](https://github.com/Azure/AzureLocal-Supportability/blob/main/TSG/Update/Solution-Update-CAU-Run-fails-due-to-Windows-Defender-blocking-WMI-commands.md). |
| Add server, Repair server <!--35816797--> | Add node and repair node operations fail when running on 11.2510.1002.87 or 12.2510.1002.88, as these images were recalled and don't exist. | Upgrade your environment to 11.2510.1002.93 or 12.2510.1002.94. <br><br> If you need to run add node or repair node operations during the update from 1.2510.1002.87/12.2510.1002.88 to 11.2510.1002.93/12.2510.1002.94, [open a support case](/azure/azure-portal/supportability/how-to-create-azure-support-request) to overwrite the image validation. |
| Update <!--36360771--> | Fetching the secret rotation action plan status fails. | The secret rotation completes successfully, so you can ignore the failure message. |

::: moniker-end

::: moniker range="=azloc-previous"

## Known issues for version 2604

For the 2604 release of Azure Local, Microsoft released the following update:

| Solution version | OS build |
| -- | -- |
| 12.2604.1003.1006 | 26100.32690 |

> [!IMPORTANT]
> The new deployments of this software use the **12.2604.1003.1006** build.
The release notes for this version include the issues fixed in this release, known issues in this release, and known issues carried over from previous versions.

> [!NOTE]
> For detailed remediation for common known issues, see the [Azure Local Supportability](https://github.com/Azure/AzureStackHCI-Supportability) GitHub repository.

### Fixed issues

The following table lists the fixed issues in this release:

| Feature | Issue | Comments |
| --------- | --------- | --------- |
| Update <!--37706280--> | Fixed an issue that caused the CAU run to fail with error message "Type 'EvalCauRetryApplicability' of Role 'CAU' raised an exception: CAU Run failed. Previous CAU run status was Canceled. Exceeded max CAU retries (2)". | |
| Update <!--37373738--> | SBE pre-deployment health checks aren't executed if SBE version is 5.0 or higher. | |
| Azure Local VMs <!--35957329--> | In some Azure Local VM create scenarios, when you don't specify a storage path, the precheck incorrectly targets the infrastructure volume instead of an eligible customer storage path. | The precheck logic is updated to correctly resolve and target the appropriate customer storage path when you don't explicitly provide a storage path, preventing the infrastructure volume from being used unintentionally. |
| Azure Local VMs <!--33489182--> | In some cases, gallery image create or update operations take longer than expected or timeout with larger images. | Gallery image create and update operations are optimized to improve reliability and performance, resulting in faster and more consistent image operations. |
| Azure Local VMs <!--34513309--> | VMConnect couldn't connect to Azure Local virtual machines if you deployed them in a different resource group than the Azure Local instance. | VMConnect now supports connectivity to Azure Local VMs across different resource groups from the Azure Local instance. |
| Update <!--33993719--> | Cloud Management service fails because the subscription isn't active. | An update health check was added to validate the subscription state is active. |
| Update <!-- 35851395--> | Azure Local doesn't discover SBE update. | An update health check was added to validate the discovery URL is matching hardware model and SKU. |
| Deployment <!--36020508--> | Fixed an issue that can cause deployment to fail because of DNS timeout. | |
| Update <!--35943750--> | Changed the logic to ensure the last SBE update isn't cleaned up from the update history when it's older than 180 days. | |
| Update <!--34603698--> | Fixed an issue that could prevent resuming an SBE update run. | |
| Update <!--36009293--> | Fixed an issue that could cause the update service to crash when sideloading an update. | |
| Update <!--36305565--> | Fixed an issue that prevents installing an update when a prior one failed in health check step. | |
| Repair server <!--32447442--> | Fixed an issue where `Add-server` and `Repair-server` cmdlets may fail with the error:`Cluster Build ID matches node to add's Build ID`. | |
| Azure Local VMs <!--37095551--> | Fixed an issue where VMs created from images that were deleted could fail to recover after ARB recovery. | If you have VMs created from images that were later deleted and performed an ARB recovery prior to version 2604, contact Microsoft Support to repair Azure Local VM management. |

### Known issues

| Feature | Issue | Workaround |
| --------- | --------- | --------- |
| Azure Local VMs <!--37983058--> | Instances of Azure Local version 2601 and later might experience unintended virtual machine deletion when a platform component incorrectly classifies virtual machines during routine system operations. | To protect your Azure Local instances from potential unintended VM deletion, update the Microsoft On-Premises Cloud (MOC) component by using the [Remediation Support Tool for Azure Local infrastructure component issues](/azure/azure-local/manage/remediate-support-tool-infrastructure?view=azloc-previous&preserve-view=true). Once the MOC component update is applied, the Azure Local instance is no longer exposed to this issue. For the latest update, see [Release information summary](release-information-23h2.md). |
| Azure Local VMs <!--30775126--> | The `az stack-hci-vm stop` command fails when using CLI version 1.14.x against clusters running versions prior to 2604. | Use the latest CLI and make sure to include `--skip-shutdown` parameter to force a turn off (`az stack-hci-vm stop --skip-shutdown`). Alternatively, downgrade to an earlier CLI version (1.13.0 or earlier) where the default stop behavior is supported on all clusters. |

### Known issues from previous releases

The following table lists the known issues from previous releases:

| Feature | Issue | Workaround |
| --------- | --------- | --------- |
| Azure Local VMs <!--37983058--> | Instances of Azure Local version 2601 and later might experience unintended virtual machine deletion when a platform component incorrectly classifies virtual machines during routine system operations. | To protect your Azure Local instances from potential unintended VM deletion, update the Microsoft On-Premises Cloud (MOC) component by using the [Remediation Support Tool for Azure Local infrastructure component issues](/azure/azure-local/manage/remediate-support-tool-infrastructure?view=azloc-previous&preserve-view=true). After you apply the MOC component update, the Azure Local instance is no longer exposed to this issue. For the latest update, see [Release information summary](release-information-23h2.md). |
| Windows Admin Center <!--60836305--> | Instances of Windows Admin Center with installed versions of Cluster Manager lower than 5.2.6 might experience problems with volume deletion operations. | To prevent data loss, update the Cluster manager extension to version 5.2.6 or ensure you're using Windows Admin Center version 2511 build 2.6.6.18 or higher. Don't delete your volumes in Windows Admin Center unless the Cluster manager extension is updated. |
| Update <!--36808734--> | During the update, health checks might report the error: `SBE manifest endpoint not reported by Get-SolutionDiscoveryDiagnosticInfo`. | This is a warning-level error. You can ignore it while running the update. |
| Deployment <!--33008717--> | In this release and previous releases, registration fails with the following error when you try to register Azure Local machines with Azure Arc: <br>`AZCMAgent command failed with error: >> exitcode: 42. Additional Info: See https://aka.ms/arc/azcmerror`. | For detailed steps on how to resolve this issue, see the [Troubleshooting guide](https://github.com/Azure/AzureLocal-Supportability/blob/main/TSG/ArcRegistration/TSG-Arc-registration-failing-with-error-42.md). |
| Azure Local VM management | The Mochostagent service might appear to be running but can get stuck without updating logs for over a month. You can identify this issue by checking the service logs in `C:\programdata\mochostagent\logs` to see if logs are being updated. | Run the following command to restart the mochostagent service: `restart-service mochostagent`. |
| Update | When you view the readiness check results for an Azure Local instance via the Azure Update Manager, there might be multiple readiness checks with the same name. | There's no known workaround in this release. Select **View details** to view specific information about the readiness check. |
| Update | There's an intermittent issue in this release when the Azure portal incorrectly reports the update status as **Failed to update** or **In progress** though the update is complete. | [Connect to your Azure Local instance](./update/update-via-powershell-23h2.md#connect-to-your-azure-local) via a remote PowerShell session. To confirm the update status, run the following PowerShell cmdlets: <br><br> `$Update = get-solutionupdate`\| `? version -eq "<version string>"`<br><br>Replace the version string with the version you're running. For example, "10.2405.0.23". <br><br>`$Update.state`<br><br>If the update status is **Installed**, no further action is required. The Azure portal refreshes the status correctly within 24 hours. <br> To refresh the status sooner, follow these steps on one of the nodes. <br>Restart the Cloud Management cluster group.<br>`Stop-ClusterGroup "Cloud Management"`<br>`Start-ClusterGroup "Cloud Management"` |
| Azure portal <!--25741164--> | In some instances, the Azure portal might take a while to update and the view might not be current. | You might need to wait for 30 minutes or more to see the updated view. |
| Security <!--30348397--> | Azure Local might face an issue during normal operations (for example, Update, Repair) while using Defender for Endpoint and when the **Restrict App Execution** setting is enabled for one or more servers in the deployment. | Disable the **Restrict App Execution** setting in the Defender portal and reboot. If the issue persists, [open a support case](/azure/azure-portal/supportability/how-to-create-azure-support-request). |
| Deployment <!--33390832--> | In rare instances, deployment fails with errors during validation that state that the mandatory Arc extensions aren't yet installed. | If you face this issue, retry the deployment. |
| Security | If the Windows Defender attack surface reduction rule Block Process Creations originating from PSExec & WMI commands is configured to Block, the Azure Local Solution Update fails to run. | For detailed steps on how to resolve this issue, see the [Troubleshooting guide](https://github.com/Azure/AzureLocal-Supportability/blob/main/TSG/Update/Solution-Update-CAU-Run-fails-due-to-Windows-Defender-blocking-WMI-commands.md). |
| Add server, Repair server <!--35816797--> | Add node and repair node operations fail when running on 11.2510.1002.87 or 12.2510.1002.88, as these images were recalled and don't exist. | Upgrade your environment to 11.2510.1002.93 or 12.2510.1002.94. <br><br> If you need to run add node or repair node operations during the update from 1.2510.1002.87/12.2510.1002.88 to 11.2510.1002.93/12.2510.1002.94, [open a support case](/azure/azure-portal/supportability/how-to-create-azure-support-request) to overwrite the image validation. |
| Update <!--36360771--> | Fetching the secret rotation action plan status fails. | The secret rotation completes successfully, so you can ignore the failure message. |

### Known and expected behaviors

The following table lists the known and expected system behaviors that shouldn't be considered as bugs or limitations.

| Feature | Behavior | Workaround |
| --------- | --------- | --------- |
| Operating system  | Restoring the registry by using *RegBack* isn't supported on Azure Local. This operation can remove the Lifecycle Manager (LCM) and Microsoft On-premises Cloud (MOC) settings on your Azure Local instance, which can corrupt the solution. | |

## Known issues for version 2603

For the 2603 release of Azure Local, Microsoft released the following update:

| Solution version | OS build |
| -- | -- |
| 12.2603.1002.502 | 26100.32522 |

> [!IMPORTANT]
> New deployments of this software use the **12.2603.1002.502** build.
The release notes for this version include the issues fixed in this release, known issues in this release, and known issues carried over from previous versions.

> [!NOTE]
> For detailed remediation for common known issues, see the [Azure Local Supportability](https://github.com/Azure/AzureStackHCI-Supportability) GitHub repository.

### Fixed issues

The following table lists the fixed issues in this release:

| Feature | Issue | Comments |
| --------- | --------- | --------- |
| Deployment <!--37166210--> | Fixed issue in environment validator that blocked deployment when an overlapping IP space with Arc resource bridge was found. | |
| Update <!--37292238--> | Fixed issue that caused update to fail in some scenarios because of a timeout when updating Microsoft Defender Antivirus. | |
| Update <!--37151259--> | Fixed issue with an update health check related to storage health that would incorrectly prevent update to start. | |
| Azure Local VMs <!--36356595--> | Fixed issue where infrastructure logical network details didn't display DNS server and VM switch information. | |
| Azure Local VMs <!--36958790--> | Fixed issue where the L4* GPU wasn't functional. | |
| Deployment <!--35378770--> | Fixed issue in deployment wizard where key vault creation during extension installation was blocking forward navigation. | |
| Deployment <!--35380820--> | Fixed issue where retrying deployment via the Azure portal would fail. | |
| Deployment <!--36430065--> | Added end-of-support banner messages to the **Get started** tab for Azure Local instances on OS version 22H2. | |

### Known issues

The following table lists the known issues in this release:

| Feature | Issue | Workaround |
| --------- | --------- | ------------ |
| Azure Local VMs <!--37983058--> | Instances of Azure Local version 2601 and later might experience unintended virtual machine deletion when a platform component incorrectly classifies virtual machines during routine system operations. | To protect your Azure Local instances from potential unintended VM deletion, update the Microsoft On-Premises Cloud (MOC) component by using the [Remediation Support Tool for Azure Local infrastructure component issues](/azure/azure-local/manage/remediate-support-tool-infrastructure?view=azloc-previous&preserve-view=true). After you apply the MOC component update, the Azure Local instance is no longer exposed to this issue. For the latest update, see [Release information summary](release-information-23h2.md). |
| Windows Admin Center <!--60836305--> | Instances of Windows Admin Center with installed versions of Cluster Manager lower than 5.2.6 might experience problems with volume deletion operations. | To prevent data loss, update the Cluster manager extension to version 5.2.6 or ensure you're using Windows Admin Center version 2511 build 2.6.6.18 or higher. Don't delete your volumes in Windows Admin Center unless the Cluster manager extension is updated. |
| Update <!--36808734--> | During the update, health checks might report the error: `SBE manifest endpoint not reported by Get-SolutionDiscoveryDiagnosticInfo`. | This is a warning-level error. You can ignore it while running the update. |

### Known issues from previous releases

The following table lists the known issues from previous releases:

| Feature | Issue | Workaround |
| --------- | --------- | --------- |
| Azure Local VMs <!--37983058--> | Instances of Azure Local version 2601 and later might experience unintended virtual machine deletion when a platform component incorrectly classifies virtual machines during routine system operations. | To protect your Azure Local instances from potential unintended VM deletion, update the Microsoft On-Premises Cloud (MOC) component by using the [Remediation Support Tool for Azure Local infrastructure component issues](/azure/azure-local/manage/remediate-support-tool-infrastructure?view=azloc-previous&preserve-view=true). After you apply the MOC component update, the Azure Local instance is no longer exposed to this issue. For the latest update, see [Release information summary](release-information-23h2.md). |
| Add server <br> Repair server <!--32447442--> | The `Add-server` and `Repair-server` cmdlets fail with the error: <br> `Cluster Build ID matches node to add's Build ID`. | Use the OS image of the same solution version as the version running on the existing cluster. To get the OS image, identify and download the image version from this [Release table](https://github.com/Azure-Samples/AzureLocal/blob/main/os-image/os-image-tracking-table.md). |
| Deployment <!--33008717--> | In this release and previous releases, registration fails with the following error when you try to register Azure Local machines with Azure Arc: <br>`AZCMAgent command failed with error: >> exitcode: 42. Additional Info: See https://aka.ms/arc/azcmerror`. | For detailed steps on how to resolve this issue, see the [Troubleshooting guide](https://github.com/Azure/AzureLocal-Supportability/blob/main/TSG/ArcRegistration/TSG-Arc-registration-failing-with-error-42.md). |
| Azure Local VM management | The Mochostagent service might appear to be running but can get stuck without updating logs for over a month. You can identify this issue by checking the service logs in `C:\programdata\mochostagent\logs` to see if logs are being updated. | Run the following command to restart the mochostagent service: `restart-service mochostagent`. |
| Update | When you view the readiness check results for an Azure Local instance via the Azure Update Manager, there might be multiple readiness checks with the same name. | There's no known workaround in this release. Select **View details** to view specific information about the readiness check. |
| Update | There's an intermittent issue in this release when the Azure portal incorrectly reports the update status as **Failed to update** or **In progress** though the update is complete. | [Connect to your Azure Local instance](./update/update-via-powershell-23h2.md#connect-to-your-azure-local) via a remote PowerShell session. To confirm the update status, run the following PowerShell cmdlets: <br><br> `$Update = get-solutionupdate`\| `? version -eq "<version string>"`<br><br>Replace the version string with the version you're running. For example, "10.2405.0.23". <br><br>`$Update.state`<br><br>If the update status is **Installed**, no further action is required. The Azure portal refreshes the status correctly within 24 hours. <br> To refresh the status sooner, follow these steps on one of the nodes. <br>Restart the Cloud Management cluster group.<br>`Stop-ClusterGroup "Cloud Management"`<br>`Start-ClusterGroup "Cloud Management"` |
| Add server <!--26852600--> | In this release and previous releases, when adding a machine to the system, you can't update the proxy bypass list string to include the new machine. Updating environment variables proxy bypass list on the hosts doesn't update the proxy bypass list on Azure resource bridge or AKS. | There's no workaround in this release. If you encounter this issue, contact Microsoft Support to determine next steps. |
| Azure portal <!--25741164--> | In some instances, the Azure portal might take a while to update and the view might not be current. | You might need to wait for 30 minutes or more to see the updated view. |
| Security <!--30348397--> | Azure Local might face an issue during normal operations (for example, Update, Repair) while using Defender for Endpoint and when the **Restrict App Execution** setting is enabled for one or more servers in the deployment. | Disable the **Restrict App Execution** setting in the Defender portal and reboot. If the issue persists, [open a support case](/azure/azure-portal/supportability/how-to-create-azure-support-request). |
| Deployment <!--33390832--> | In rare instances, deployment fails with errors during validation that state that the mandatory Arc extensions aren't yet installed. | If you face this issue, retry the deployment. |
| Security | If the Windows Defender attack surface reduction rule Block Process Creations originating from PSExec & WMI commands is configured to Block, the Azure Local Solution Update fails to run. | For detailed steps on how to resolve this issue, see the [Troubleshooting guide](https://github.com/Azure/AzureLocal-Supportability/blob/main/TSG/Update/Solution-Update-CAU-Run-fails-due-to-Windows-Defender-blocking-WMI-commands.md). |
| Add server, Repair server <!--35816797--> | Add node and repair node operations fail when running on 11.2510.1002.87 or 12.2510.1002.88, as these images were recalled and don't exist. | Upgrade your environment to 11.2510.1002.93 or 12.2510.1002.94. <br><br> If you need to run add node or repair node operations during the update from 1.2510.1002.87/12.2510.1002.88 to 11.2510.1002.93/12.2510.1002.94, [open a support case](/azure/azure-portal/supportability/how-to-create-azure-support-request) to overwrite the image validation. |
| Azure Local VMs <!--35810643--> | VM start, stop, or delete operations may fail due to the wssdagent node agent crashing. | To check if wssdagent crashed, run the following command: <br><br> `$ServerList = (Get-Clusternode).name` <br> `foreach ($Server in $ServerList) {` <br> `Write-Output "Cluster Node: $Server..."` <br> `Invoke-Command -ComputerName $Server -ScriptBlock {` <br> `get-service wssdagent` <br> `}` <br> `}` <br><br> If the wssdagent status shows "Stopped", run the following command to restart the agent from that node: <br><br> `start-service wssdagent` <br><br> This action gets the node agent running again and unblocks the VMs. If any VMs are deleted while the node agent is down, [open a support case](/azure/azure-portal/supportability/how-to-create-azure-support-request) to get the issue resolved. |
| Update <!--36360771--> | Fetching the secret rotation action plan status fails. | The secret rotation completes successfully, so you can ignore the failure message. |

### Known and expected behaviors

The following table lists the known and expected system behaviors that shouldn't be considered as bugs or limitations.

| Feature  | Behavior  |  Workaround |
|---------|---------|---------|
| Operating system  | Restoring the registry by using *RegBack* isn't supported on Azure Local. This operation can remove the Lifecycle Manager (LCM) and Microsoft On-premises Cloud (MOC) settings on your Azure Local instance, which can corrupt the solution.  | |

::: moniker-end
