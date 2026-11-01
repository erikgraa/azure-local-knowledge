# Symptoms
  
When deploying a new 23h2 cluster based on the previously available 2411.0 image, there may be occurrences where you will experience a timeout while initiating the validation process "**Triggering deployment settings validation call....**"

**Note:** This article is specific to the issue associated with the 2411.0 release. There is a new issue for the latest build (2411.1 in combination of the newly released LCM Extension (version 30.2411.1.760)) which presents with the same error symptom in the Portal, but has specific issue validation steps that should be followed, please see the new article [Triggering Deployment Settings Validation Call Results in Operation Timeout in 2411.1 and LCM Extension 30.2411.1.760](https://github.com/Azure/AzureLocal-Supportability/blob/main/TSG/Deployment/Triggering-deployment-settings-validation-call-results-in-OperationTimeout-2411-1-and-LCM-Extension-2411-1.md) for more information on that issue.

# Issue Validation
To confirm the scenario that you are encountering is the issue documented in this article, please confirm that you see a similar error as showed below:

"**Could not complete the operation. 200: OperationTimeout , No updates received from device for operation (...) beyond timeout of [600000] ms**.

<img width="400" alt="Items" src="https://github.com/user-attachments/assets/4a397318-7d01-4674-9db5-e406fc15a0fe">

# Cause
Nodes are not set with UTC as their time zone. The issue has been identified and the permanent mitigation will be offered in a future LCM extension version. **The current workaround is to make sure that all the nodes are set to time zone "UTC"**.

# Mitigation Details

```
1.  Log into each of the Azure Local nodes and change the time zone to UTC using the command `Set-TimeZone -Id "UTC"`, then reboot the nodes.

2.  Once they are up, make sure LCM service is running using the command `Get-Service LcmController` as shown in the example below.  
    
PS C:\> Get-Service LcmController

Status   Name               DisplayName
------   ----               -----------
Running  LcmController      LcmController

3. Please retry the validation process.
```
