# Telemetry Metrics Catalogue — Personal Dashboard

<!-- The list numbers reach three digits, which prettier re-indents differently on every run. -->
<!-- prettier-ignore-start -->

This document details 140 telemetry metrics, predictive analytics models, custom indices, and psychological health indicators derived from the `personal-dashboard` data collection ecosystem, alongside a complete UX/UI design blueprint for seamless visual integration.

## Section 1. 40 Current State & Tracking Metrics

1.  **Deep Work Ratio**

    - **Formula:** $\frac{\sum \text{Time in IDE, Docs, Code Tools}}{\sum \text{Total Active PC Usage}} \times 100\%$

    - **Extraction:** Aggregate session durations for whitelisted development processes from desktop window logs.

2.  **Late-Night Shift Score**

    - **Formula:** $\sum \text{Active Session Durations (PC + Phone)} \quad \text{where } t \in [00:00, 05:00]$ (in minutes).

    - **Extraction:** Filter timestamped keyboard/mouse inputs or device unlock events within the midnight-to-5AM window.

3.  **Unlocks per Hour**

    - **Formula:** $\frac{\text{Count of } \mathtt{android\_unlock} \text{ events}}{\text{Active Waking Hours}}$

    - **Extraction:** Count screen unlock events recorded by the Android telemetry module over active hours.

4.  **Context Switch Rate**

    - **Formula:** $\frac{\text{Total Active Window Switches on PC}}{\text{Total PC Usage Hours}}$

    - **Extraction:** Count frequency of active window title or `process_name` changes in desktop activity logs.

5.  **Notification Interruption Rate**

    - **Formula:** $\frac{\text{Incoming Push Notifications Triggering Unlock}}{\text{Total Incoming Push Notifications}}$

    - **Extraction:** Cross-reference Android push timestamps with screen unlock timestamps (window $\le 30\text{s}$).

6.  **Daily Mobility Index**

    - **Formula:** $\sum \text{Distance between Consecutive Coordinates (km)}$

    - **Extraction:** Apply the Haversine formula across ordered GPS coordinates from the Android geolocation stream.

7.  **Daily Burn Rate**

    - **Formula:** $\frac{\sum \text{Expenses Today}}{\text{Monthly Budget} / \text{Days in Month}}$

    - **Extraction:** Sum current-date transactions from the financial tracking module and compare to the daily baseline.

8.  **Media Consumption Ratio**

    - **Formula:** $\frac{\sum \text{Time Watching Media/Streams}}{\sum \text{Total Screen Time}} \times 100\%$

    - **Extraction:** Aggregate time spent on media domains/apps (YouTube, streaming platforms, browser extension telemetry).

9.  **Infra Stability Score**

    - **Formula:** $\left(1 - \frac{\text{Container Crashes} + \text{Backup Failures}}{\text{Total Daily Health Checks}}\right) \times 100\%$

    - **Extraction:** Parse Docker container status logs and automated health-check script reports.

10. **First Action Latency**

    - **Formula:** $\text{Timestamp of First Productive Action} - \text{Timestamp of Morning Wake-Up/First Unlock}$

    - **Extraction:** Calculate time delta between morning device wake-up and first action in work applications.

11. **Task Velocity Index**

    - **Formula:** $\frac{\text{Completed Tasks (Done)}}{\text{Planned Tasks (Todo)}}$

    - **Extraction:** Query daily completed vs. planned task records from the task management system.

12. **Bot Prompt Compliance Rate**

    - **Formula:** $\frac{\text{Replies to Telegram Bot Prompts}}{\text{Total Prompts Sent by Bot}}$

    - **Extraction:** Match outgoing bot prompt IDs with incoming user responses in Telegram bot logs.

13. **Local AI Sovereignty Ratio**

    - **Formula:** $\frac{\text{Local Ollama Requests}}{\text{Ollama Requests} + \text{Cloud API Requests (OpenAI, DeepSeek)}} \times 100\%$

    - **Extraction:** Parse token metrics and provider tags in LLM integration proxy logs.

14. **Git Commit Density**

    - **Formula:** $\sum (\text{Commit Count} \times \text{Lines Changed}) \text{ per hour slot}$

    - **Extraction:** Parse local Git logs or repository GitHub webhooks.

15. **Break Adherence Rate**

    - **Formula:** $\frac{\text{Completed Stretch/Rest Recommendations}}{\text{Rest Prompts Triggered by Desktop Agent}}$

    - **Extraction:** Compare timer rest alerts with lock-screen triggers or physical idle events.

16. **Daily Screen Time Deviation**

    - **Formula:** $\vert\text{Today's Total PC Time} - \text{30-Day Median PC Time}\vert$

    - **Extraction:** Compute absolute deviation from rolling 30-day median screen time.

17. **Notification Dismissal Rate**

    - **Formula:** $\frac{\text{Push Notifications Dismissed Without App Open}}{\text{Total Received Notifications}}$

    - **Extraction:** Analyze notification status events (`dismissed` vs `opened`).

18. **App Switch Fatigue Index**

    - **Formula:** $\max(\text{Count of Unique Active Applications in a 1-Hour Rolling Window})$

    - **Extraction:** Track unique application PIDs/process names in rolling one-hour segments.

19. **Gaming Quota Adherence**

    - **Formula:** $\max\left(0, 1 - \frac{\text{Actual Gaming Time}}{\text{Allocated Gaming Quota}}\right)$

    - **Extraction:** Sum total execution time of flagged gaming processes from desktop logs.

20. **CLI vs GUI Ratio**

    - **Formula:** $\frac{\text{Terminal Active Window Time}}{\text{Total PC Work Time}}$

    - **Extraction:** Filter window logs for terminal applications (Alacritty, PowerShell, Terminal).

21. **Morning Doomscrolling Volume**

    - **Formula:** $\sum \text{Entertainment App Usage Time within 2 Hours of Waking}$

    - **Extraction:** Intersect wake-up timestamp with mobile app foreground usage logs.

22. **Background Network Intensity**

    - **Formula:** $\sum \text{Inbound/Outbound Network Traffic (MB)} \quad \text{while user is idle}$

    - **Extraction:** Match OS network interface counters with user input idle status (`is_idle == true`).

23. **Quick Capture Frequency**

    - **Formula:** $\frac{\text{Notes Created via Telegram Bot / Quick Extension}}{\text{Day}}$

    - **Extraction:** Count journal entries tagged with `quick_capture` metadata.

24. **Vault Security Health Score**

    - **Formula:** $\left(1 - \frac{\text{Outdated/Weak Credentials in Vault}}{\text{Total Vault Entries}}\right) \times 100\%$

    - **Extraction:** Run automated daily audits on the encrypted credential store.

25. **Shortcut Efficiency Ratio**

    - **Formula:** $\frac{\text{Modifier Key Press Count (Ctrl, Cmd, Alt)}}{\text{Total Mouse Click Count}}$

    - **Extraction:** Log keyboard hotkeys and mouse clicks via low-level OS input hooks.

26. **Focus Block Length**

    - **Formula:** $\text{Average Uninterrupted Duration per App Session (minutes)}$

    - **Extraction:** Calculate mean time between application focus change events.

27. **Evening Efficiency Drop**

    - **Formula:** $\frac{\text{Work Output Rate After 18:00}}{\text{Work Output Rate Before 14:00}} \times 100\%$

    - **Extraction:** Compare task completion rates and IDE active time across daily time windows.

28. **Audio/Music Listening Volume**

    - **Formula:** $\sum \text{Audio Player Execution Duration per Day}$

    - **Extraction:** Monitor audio playback processes (Spotify, local players) via system media session APIs.

29. **Local Storage Growth Rate**

    - **Formula:** $\frac{\Delta \text{Local Telemetry DB \& Log Size (MB)}}{\text{Day}}$

    - **Extraction:** Monitor directory storage footprint of the `./data/` telemetry path.

30. **Update Lag Days**

    - **Formula:** $\text{Current Date} - \text{Date of Last System Package/Container Update}$

    - **Extraction:** Parse package manager update logs and Docker deployment timestamps.

31. **Command Execution Count**

    - **Formula:** $\sum \text{Terminal Commands Executed per Day}$

    - **Extraction:** Integrate hooks with shell history (`.bash_history`, `.zsh_history`).

32. **Inbox Zero Velocity**

    - **Formula:** $\frac{\text{Processed/Archived Notifications}}{\text{Total Incoming Notifications}}$

    - **Extraction:** Track read/archived events in messaging and notification logs.

33. **Sleep Window Variance**

    - **Formula:** $\text{Standard Deviation of Sleep Time over Last 7 Days}$

    - **Extraction:** Compute standard deviation of last daily activity timestamps over a 7-day window.

34. **Clipboard Traffic Volume**

    - **Formula:** $\sum \text{Text Blocks Copied per Day}$

    - **Extraction:** Count copy events captured by the background clipboard listener service.

35. **Daily Token Consumption**

    - **Formula:** $\sum (\text{Prompt Tokens} + \text{Completion Tokens}) \text{ in 24 Hours}$

    - **Extraction:** Aggregate token usage parameters across LLM proxy logs.

36. **Unique Places Count**

    - **Formula:** $\text{Count of Geofence Clusters (Radius } < 100\text{m, Dwell Time } > 15\text{m)}$

    - **Extraction:** Apply DBSCAN spatial clustering to mobile GPS coordinate streams.

37. **Idle CPU Load Average**

    - **Formula:** $\text{Mean CPU Usage \% during User Inactivity}$

    - **Extraction:** Sample `psutil` CPU metrics when desktop input hook reports `is_idle == true`.

38. **Reboot Frequency**

    - **Formula:** $\text{Count of System Boot Events (Uptime } < 1\text{h) per Week}$

    - **Extraction:** Query system uptime logs and reboot event records.

39. **Journal Word Count**

    - **Formula:** $\sum \text{Words Written in Daily Journal/Notes}$

    - **Extraction:** Count words during Markdown file saves in the scratchpad repository.

40. **Backup Freshness Age**

    - **Formula:** $\text{Current Time} - \text{Timestamp of Last Successful Offsite Backup (hours)}$

    - **Extraction:** Inspect completion timestamps in automated backup job logs.

## Section 2. 40 Predictive & Correlation Analytics Metrics

41. **Burnout Risk Probability**

    - **Formula:** $P = \sigma(w_1 \cdot \text{LateNightScore}_3 + w_2 \cdot \text{Unlocks}_3 - w_3 \cdot \text{DeepWork}_3)$

    - **Extraction:** Logistic regression using 3-day rolling averages of sleep deprivation, phone checks, and deep work.

42. **Predicted Mood Score**

    - **Formula:** $\text{Mood} = \beta_0 + \beta_1(\text{FirstActionLatency}) - \beta_2(\text{ContextSwitchRate}) + \beta_3(\text{DeepWorkRatio})$

    - **Extraction:** Linear regression model calibrated on morning/midday telemetry inputs.

43. **Procrastination Trigger Risk**

    - **Formula:** $P(\text{Distraction within 30m}) \quad \text{if } \text{ContextSwitchRate} > 2 \times \text{median}$

    - **Extraction:** Markov chain state-transition model evaluated on rapid app-switching events.

44. **Predicted Sleep Time**

    - **Formula:** $\text{ExpectedSleep} = \text{BaseTime} + 0.05(\text{Post-21:00 Media Min}) + 0.1(\text{LateStart Min})$

    - **Extraction:** Regression model factoring evening screen time and morning shift offsets.

45. **Impulse Spend Hazard**

    - **Formula:** $\text{Risk} \ge 0.7 \quad \text{if } \text{FatigueIndex} > 80\% \text{ AND } t > 20:00 \text{ AND E-Commerce Active}$

    - **Extraction:** Binary decision tree evaluator triggered by late-night browsing of commerce sites.

46. **Workout Skip Probability**

    - **Formula:** $P(\text{Skip}) = 1 - \min\left(1, \frac{\text{StepsBefore1600}}{5000}\right)$

    - **Extraction:** Heuristic probability assessment based on mid-afternoon step count milestones.

47. **Sprint Success Probability**

    - **Formula:** $P(\text{Sprint Complete}) = \frac{\text{DoneToday}}{\text{TotalTodo}} \times \left(\frac{\text{Remaining Hours}}{\text{Avg Task Velocity}}\right)$

    - **Extraction:** Extrapolate task resolution rates over remaining active working hours.

48. **Infra Failure Risk Forecast**

    - **Formula:** $\text{Risk} = f(\Delta \text{StorageFree}, \Delta \text{CPUTemp}, \text{ErrorRate})$

    - **Extraction:** Anomaly detection threshold when disk free space drops below 10% or error rates spike.

49. **Doomscrolling Hazard Index**

    - **Formula:** $P(\text{Session } > 30\text{m}) \quad \text{given } \text{Unlocks} > 5/\text{hour after 21:00}$

    - **Extraction:** Sequence analysis of short unlocking clusters in evening hours.

50. **Morning Deep Work Yield Forecast**

    - **Formula:** $\text{Expected Deep Work Hours} = 0.4(\text{SleepHours}) - 0.05(\text{FirstActionLatency})$

    - **Extraction:** Multiple linear regression mapping sleep duration and start latency to output hours.

51. **Interruption Vulnerability Window**

    - **Formula:** $\text{Identify peak hours in Matrix } (\text{Hour of Day} \times \text{Historic Distraction Rate})$

    - **Extraction:** Frequency distribution of push notification responses across historical hour slots.

52. **Weight Trajectory Projection**

    - **Formula:** $\Delta \text{Weight} = \frac{\sum_{7\text{d}} (\text{Est. Caloric Intake} - \text{Est. Expenditure})}{7700\text{ kcal}}$

    - **Extraction:** Cross-reference food transaction logs with mobility/step activity profiles.

53. **Notification Fatigue Threshold**

    - **Formula:** $\text{Fatigue Risk} = 1 \quad \text{when } \sum \text{Bot Prompts Today} > 15 \text{ and Response Rate drops } > 50\%$

    - **Extraction:** Calculate rolling drop in bot response compliance against daily prompt volume.

54. **Productive Weekend Probability**

    - **Formula:** $P(\text{Productive}) = 0.5 + 0.1(\text{FridayCommitCount}) - 0.2(\text{FridayFatigue})$

    - **Extraction:** Classification model trained on Friday end-of-week telemetry signals.

55. **API Token Exhaustion ETA**

    - **Formula:** $\text{Days Remaining} = \frac{\text{Remaining Quota Balance}}{\text{Rolling 7-Day Average Daily Consumption}}$

    - **Extraction:** Linear extrapolation of LLM API usage tokens against remaining provider caps.

56. **Project Deadline Drift Days**

    - **Formula:** $\text{Drift (Days)} = \frac{\text{Remaining Task Scope}}{\text{Current Velocity (Tasks/Day)}} - \text{Calendar Days Remaining}$

    - **Extraction:** Compare repository task backlogs against historical commit and issue resolution speed.

57. **Cash Flow Crunch Probability**

    - **Formula:** $P(\text{Balance } < 0) \quad \text{projected to end of month via Current Burn Rate}$

    - **Extraction:** Linear regression projecting account balance against daily spending velocity.

58. **Social Battery Depletion Forecast**

    - **Formula:** $\text{Depletion Level} = \sum_{48\text{h}} \text{Time in High-Density Geofences (Hours)}$

    - **Extraction:** Aggregate dwell time in public geofenced zones over a rolling 48-hour window.

59. **Complex Task Success Probability**

    - **Formula:** $P(\text{Success}) \propto \text{Continuous Deep Work Blocks } \ge 2\text{h} \text{ AND } \text{Notifications Received} = 0$

    - **Extraction:** Calculate overlap between uninterrupted IDE focus sessions and notification events.

60. **Habit Streak Break Probability**

    - **Formula:** $P(\text{Break}) = \text{Base Risk} + 0.3(\text{StressIndex}) + 0.2(\text{LateNightYesterday})$

    - **Extraction:** Probabilistic model scoring daily habit break conditions against stress and fatigue metrics.

61. **Predicted Morning Vital Sign**

    - **Formula:** $\text{Recovery Score} = f(\text{Sleep Window Variance}, \text{Late-Night Shift Score})$

    - **Extraction:** Estimate physical recovery level based on circadian sleep regularity parameters.

62. **Network Bandwidth Saturation Risk**

    - **Formula:** $P(\text{Saturation}) = 1 \quad \text{if Scheduled Cron Backups overlap with Active Streaming}$

    - **Extraction:** Predict network congestion based on backup cron schedules and media activity logs.

63. **Task Omission Risk**

    - **Formula:** $\text{Risk} \propto \text{Count of Quick Notes without Assigned Due Dates } (> 10/\text{day})$

    - **Extraction:** Count unprocessed entries in the quick-capture inbox buffer.

64. **Simulation Completion ETA**

    - **Formula:** $\text{ETA} = \frac{\text{Total Iterations} - \text{Completed Iterations}}{\text{Current Iteration Speed (Iter/sec)}}$

    - **Extraction:** Parse computation progress logs (e.g., Monte Carlo simulation output streams).

65. **Weather Sensitivity Index**

    - **Formula:** $\text{Pearson Correlation}(\text{Outdoor Temp}, \text{Deep Work Ratio})$

    - **Extraction:** Calculate Pearson correlation between local weather API data and focus metrics.

66. **Technical Debt Accumulation Rate**

    - **Formula:** $\text{Debt Rate} = \frac{\Delta \text{Lines of Code} - \Delta \text{Test/Refactor Lines}}{\text{Total Lines Added}}$

    - **Extraction:** Analyze `git diff` output categorization (`feat` vs `test`/`refactor`).

67. **Wanderlust Trigger Probability**

    - **Formula:** $P(\text{Travel}) \propto \text{Days in Static Geofence } (> 10) \times \text{Map App Usage Time}$

    - **Extraction:** Evaluate geolocation persistence against map application search queries.

68. **Security Rotation Alert ETA**

    - **Formula:** $\text{Days to Alert} = 90 - (\text{Current Date} - \text{Date of Last Password Change})$

    - **Extraction:** Audit creation/update timestamps in the encrypted credentials vault.

69. **Morning Fatigue Risk**

    - **Formula:** $\text{High Risk} \quad \text{if } \text{LateNightShift} > 2\text{h AND } \text{ScreenTimeBeforeSleep} > 3\text{h}$

    - **Extraction:** Evaluate rule-based heuristic on late-night telemetry patterns.

70. **Disk Full ETA**

    - **Formula:** $\text{Days to Full} = \frac{\text{Free Disk Space (GB)}}{\text{Rolling Average Storage Consumption (GB/Day)}}$

    - **Extraction:** Extrapolate growth trends of local log files and telemetry database tables.

71. **Journal Skip Probability**

    - **Formula:** $P(\text{Skip}) \propto \text{Time} > 22:00 \text{ AND } \text{FatigueIndex} = \max$

    - **Extraction:** Evaluate logistic model against evening time markers and active usage hours.

72. **Network Drop Risk**

    - **Formula:** $\text{Drop Risk} \propto \text{Network Interface Reconnection Count in Last 6 Hours}$

    - **Extraction:** Parse network daemon reconnection logs.

73. **Dashboard Module Usage Forecast**

    - **Formula:** $P(\text{Module Access}) = f(\text{Day of Week}, \text{Time of Day}, \text{Historical Clicks})$

    - **Extraction:** Categorize UI navigation click events into temporal probability maps.

74. **CI/CD Pipeline Failure Risk**

    - **Formula:** $P(\text{Failure}) = f(\text{Lines Changed in Commit}, \text{Files Modified Count})$

    - **Extraction:** Risk scoring based on size and breadth of `git diff` payload before push.

75. **Repo Bloat Forecast**

    - **Formula:** $\text{Projected Size}_{30\text{d}} = \text{Current Size} + 30 \times (\text{Daily Storage Delta})$

    - **Extraction:** Linear growth projection of project directory and `.git` repository size.

76. **Hardware Bottleneck Warning**

    - **Formula:** $\text{Warning} = \text{True} \quad \text{if } \text{Time}(\text{CPU or RAM} > 90\%) > 0.2(\text{Work Time})$

    - **Extraction:** Aggregate peak system utilization events from `psutil` data.

77. **Late Meal Risk**

    - **Formula:** $P(\text{Late Meal}) \propto \text{Work End Time} > 21:00 \text{ AND } \text{Food Delivery Transactions}$

    - **Extraction:** Match late-night work session endings with food vendor transaction categories.

78. **Typing Error Stress Indicator**

    - **Formula:** $\text{Stress Score} = \frac{\text{Backspace / Delete Keystrokes}}{100 \text{ Total Keystrokes}}$

    - **Extraction:** Track keystroke correction ratios via low-level keyboard input listeners.

79. **Vault Cleanup Urgency**

    - **Formula:** $\text{Urgency} = \frac{\text{Unused Temp Files} + \text{Stale Backups}}{\text{Storage Threshold}}$

    - **Extraction:** Scan system `/tmp/` and backup directories for expired file artifacts.

80. **AI Daily Summary Confidence Score**

    - **Formula:** $\text{Confidence \%} = \left(1 - \frac{\text{Missing Sensor Feed Channels}}{\text{Total Configured Sensor Channels}}\right) \times 100\%$

    - **Extraction:** Evaluate daily telemetry data completeness across all modules before running AI summaries.

## Section 3. 40 Cool Factor & Custom Metrics

81. **Daily Digital Entropy**

    - **Formula:** $\sum (\text{File Growth (MB)} + \text{Logs} + \text{Commits} + \text{Network Traffic})$

    - **Extraction:** Aggregate total byte-level data generation across storage and network.

82. **Daily Gamification XP**

    - **Formula:** $\text{XP} = \sum (\text{Tasks} \times 10 + \text{Code Lines} \times 0.1 + \text{Exercise Min} \times 5 - \text{Late Sleep Min} \times 2)$

    - **Extraction:** RPG-style point system calculated from daily telemetry across modules.

83. **Human-AI Synergy Index**

    - **Formula:** $\frac{\text{Tasks Solved with AI Assistance}}{\text{Total Completed Tasks}} \times 100\%$

    - **Extraction:** Measure ratio of tasks linked with LLM interactions vs total closed tasks.

84. **Genealogical Echo Index**

    - **Formula:** $\text{Match Flag} = \text{True} \quad \text{if Today matches Ancestor Birth/Event Date in DB}$

    - **Extraction:** Cross-reference current date against local genealogical tree database.

85. **The Matrix Flow Minutes**

    - **Formula:** $\sum \text{Continuous IDE Focus Blocks } \ge 45 \text{ Minutes without Switches}$

    - **Extraction:** Sum long-duration focus blocks in software development tools.

86. **Circadian Heatmap Alignment**

    - **Formula:** $\text{Overlap \% between Activity Curve and Astronomical Daylight in Warsaw}$

    - **Extraction:** Compare hourly activity levels with solar elevation data for current location.

87. **Sovereignty Purity Index**

    - **Formula:** $\frac{\text{Data Processed via Self-Hosted Infra}}{\text{Total Processed Personal Data}} \times 100\%$

    - **Extraction:** Compute ratio of self-hosted requests vs third-party cloud services.

88. **Serendipity Recall Frequency**

    - **Formula:** $\text{Count of Historical Memories/Notes Presented to User Today}$

    - **Extraction:** Track triggers fired by the "On This Day" memory resurfacing engine.

89. **DEFCON Threat Level**

    - **Formula:** $\text{Level} \in [1..5] \quad \text{derived from System Alerts, Open Ports, and Failed Backups}$

    - **Extraction:** Map security audit alerts to an integrated security status scale.

90. **Offline Purity Score**

    - **Formula:** $\sum \text{Continuous Device Inactivity Periods } \ge 1 \text{ Hour during Waking Hours}$

    - **Extraction:** Find periods of zero input activity across all desktop and mobile telemetry.

91. **Wanderlust Coefficient**

    - **Formula:** $\text{Count of New H3 Spatial Hexagons Visited This Month}$

    - **Extraction:** Index GPS coordinates into Uber H3 spatial hex grids and count novel cells.

92. **Clean Architecture Ratio**

    - **Formula:** $\frac{\sum \text{Lines Deleted} + \text{Lines Refactored}}{\sum \text{Lines Added}}$

    - **Extraction:** Parse `git diff` statistics for refactoring and deletion metrics.

93. **Binge Depth Factor**

    - **Formula:** $\text{Max Count of Consecutive Media Episodes Watched in Single Session}$

    - **Extraction:** Track sequential playback completion events from browser extensions/media players.

94. **Telegram Bot Command Efficiency**

    - **Formula:** $\frac{\text{Actions Executed via Telegram Bot}}{\text{Total Actions Executed Across All Interfaces}} \times 100\%$

    - **Extraction:** Calculate proportion of dashboard actions originating from Telegram webhooks.

95. **Day Singularity Score**

    - **Formula:** $\text{Count of Unique Active Domains (Code, Finance, Geo, Health, Media, Notes)}$

    - **Extraction:** Count active domain modules that registered non-zero telemetry today.

96. **Zenith Silence Score**

    - **Formula:** $\sum \text{Hours in Do Not Disturb Mode without Missed High-Priority Alerts}$

    - **Extraction:** Combine Android DND mode logs with priority notification audit trails.

97. **Vault Entropy Index**

    - **Formula:** $\text{Score} \propto \text{Days Since Last File / Note / Credential Audit}$

    - **Extraction:** Calculate mean time elapsed since last edit across vault items and notes.

98. **Physical Energy Footprint**

    - **Formula:** $\frac{\text{Step Count} \times \text{Unique Geofences}}{\text{Sedentary PC Hours}}$

    - **Extraction:** Combine physical sensor data from phone with desktop idle logs.

99. **AI Chronicle Resonance Score**

    - **Formula:** $\text{User Rating } (1..5) \text{ of Morning AI Summary Accuracy}$

    - **Extraction:** Record rating responses submitted via Telegram prompt bot.

100.  **Code-to-Coffee Ratio**

      - **Formula:** $\frac{\text{Lines of Code Written}}{\text{Logged Coffee / Rest Pauses}}$

      - **Extraction:** Correlate git commit line additions with rest break triggers.

101.  **Unplugged Freedom Ratio**

      - **Formula:** $\frac{24\text{h} - \text{Total Active Device Hours}}{24\text{h}} \times 100\%$

      - **Extraction:** Invert total active usage session time across mobile and desktop devices.

102.  **Habit Streak Multiplier**

      - **Formula:** $\text{Count of Consecutive Days with 100\% Core Goals Achieved}$

      - **Extraction:** Calculate continuous daily completion chain in habit tracking DB.

103.  **Memory Retrieval Depth**

      - **Formula:** $\text{Mean Age (Years) of Notes/Photos Surface by System Today}$

      - **Extraction:** Compute age of archive items selected for daily memory recall.

104.  **Notification Storm Index**

      - **Formula:** $\max(\text{Incoming Notifications in a 10-Minute Rolling Window})$

      - **Extraction:** Identify peak burst rates in mobile notification event logs.

105.  **Circadian Balance Factor**

      - **Formula:** $\vert\text{Actual Sleep Time} - \text{Target Circadian Sleep Time}\vert \text{ (Minutes)}$

      - **Extraction:** Measure deviation of actual sleep onset from target baseline.

106.  **Autonomous Script Execution Count**

      - **Formula:** $\sum \text{Successful Background Cron Jobs Executed Today}$

      - **Extraction:** Count zero-exit-code events in background task scheduler logs.

107.  **Clean Working Tree Ratio**

      - **Formula:** $\frac{\text{Time Git Working Tree is Clean}}{\text{Total Active Work Time}} \times 100\%$

      - **Extraction:** Poll `git status` across active projects to measure uncommitted time.

108.  **Prompt Density Index**

      - **Formula:** $\text{Mean Token Length \& Context Depth of LLM Prompts Today}$

      - **Extraction:** Analyze prompt length and payload metadata in LLM proxy logs.

109.  **Instant Action Index**

      - **Formula:** $\text{Mean Time from System Alert Trigger to User Acknowledgment}$

      - **Extraction:** Compute delta between alert dispatch and user dismiss/acknowledgment.

110.  **Knowledge Base Growth Rate**

      - **Formula:** $\sum \text{Size of New Markdown Files in KB Directory (KB/Week)}$

      - **Extraction:** Monitor size expansion of knowledge base directories over 7-day intervals.

111.  **Zenith Serenity Index**

      - **Formula:** $\frac{1}{\text{System Alerts} + \text{Failures} + \text{Context Switches}}$

      - **Extraction:** Calculate inverse sum of daily cognitive disturbances and system friction.

112.  **Links Cross-Domain Density**

      - **Formula:** $\text{Count of Active Relations (e.g., Task } \leftrightarrow \text{ Commit } \leftrightarrow \text{ Expense)}$

      - **Extraction:** Query cross-domain relational linkages stored in the central DB.

113.  **Dev Environment Uptime**

      - **Formula:** $\text{Continuous Uptime of Development Containers (Hours)}$

      - **Extraction:** Query uptime metrics of local docker development containers.

114.  **Automation Time Saved**

      - **Formula:** $\sum (\text{Automated Script Runs} \times \text{Est. Manual Execution Time})$

      - **Extraction:** Estimate hours saved based on automated job completion counts.

115.  **Code-Life Balance Ratio**

      - **Formula:** $\frac{\text{Time Spent in IDE}}{\text{Physical Activity Time} + \text{Offline Rest Time}}$

      - **Extraction:** Ratio of development hours to physical movement and offline rest.

116.  **Weather-Productivity Correlation Index**

      - **Formula:** $\text{Pearson Correlation}(\text{Outdoor Temp}, \text{Deep Work Ratio})$

      - **Extraction:** Compute correlation between local ambient weather data and productivity.

117.  **Night Silence Index**

      - **Formula:** $\text{Flag} = 1 \quad \text{if zero device activity detected between 02:00 and 06:00}$

      - **Extraction:** Verify absolute absence of input events in the 02:00–06:00 window.

118.  **Communication Burst Index**

      - **Formula:** $\max(\text{Sent/Received Messages per Minute in Peak Hour})$

      - **Extraction:** Measure peak messaging density in chat log timestamps.

119.  **Artifact Longevity Score**

      - **Formula:** $\frac{\text{Notes/Files Accessed in Last 90 Days}}{\text{Total Stored Notes/Files}} \times 100\%$

      - **Extraction:** Inspect file system access timestamps (`atime`) across vault artifacts.

120.  **Dashboard Integrity Index**

      - **Formula:** $\frac{\text{Healthy Data Feeds}}{\text{120 Configured Telemetry Metrics}} \times 100\%$

      - **Extraction:** Global system health check rating telemetry pipeline stability.

## Section 4. 20 Psychological Health & Mental Wellbeing Metrics

121. **Mental Restlessness Index (Digital Biomarker)**

     - **Formula:** $\text{Count of Window Switches where Session Duration } < 60 \text{ Seconds per Unit Time}$

     - **Extraction:** Detect rapid, erratic app switching without sustained focus to quantify covert anxiety or cognitive fragmentation.

122. **Compulsive Checking Frequency (Digital Biomarker)**

     - **Formula:** $\frac{\text{Count of Mobile Unlocks } < 10 \text{ Seconds}}{\text{Active Hour}}$

     - **Extraction:** Track short screen unlocks that yield no meaningful action, identifying compulsive dopamine loops.

123. **Bedtime Revenge Procrastination (Digital Biomarker)**

     - **Formula:** $\sum \text{Entertainment Screen Time between Target Bedtime and Actual Sleep Onset}$

     - **Extraction:** Measure night screen usage past targeted bedtime as an indicator of daytime lack of autonomy.

124. **Digital Isolation Score (Digital Biomarker)**

     - **Formula:** $\frac{\text{Solo Screen Time}}{\text{Active Communication Time (Calls, Geofence Co-location, Messaging)}}$

     - **Extraction:** Ratio of isolated digital consumption to active social interaction hours.

125. **Typing Dynamics & Micro-Frustration Index (Digital Biomarker)**

     - **Formula:** $\frac{\text{Backspace/Delete Keystrokes}}{100 \text{ Characters}} + \text{Rapid Click Burst Events}$

     - **Extraction:** Keystroke latency variance and correction rates evaluating somatic tension and impatience.

126. **Over-Communication Pressure Index (Digital Biomarker)**

     - **Formula:** $\sum \text{Unanswered Personal Messages Accumulated per Day}$

     - **Extraction:** Track backlog of unread/unanswered social communications indicating social battery depletion.

127. **Unplugged Recovery Period (Digital Biomarker)**

     - **Formula:** $\max(\text{Continuous Daylight Hours with Zero Active Usage on Desktop \& Mobile})$

     - **Extraction:** Longest daytime block free of digital sensory input, measuring nervous system downtime.

128. **Journal Sentiment Score (Digital Biomarker)**

     - **Formula:** $\text{Local LLM Sentiment Polarity Score } \in [-1.0 \dots +1.0] \text{ on Daily Notes}$

     - **Extraction:** Run automated sentiment analysis on journal entries using local Ollama model.

129. **Energy & Vitality Scale (Self-Reported)**

     - **Formula:** $\text{Rating } [1..5] \text{ logged via Morning Telegram Prompt}$

     - **Extraction:** Daily morning check-in assessing subjective restorative sleep and energy levels.

130. **Inner Peace Index (Self-Reported)**

     - **Formula:** $\text{Rating } [1..5] \text{ logged via Evening Telegram Prompt}$

     - **Extraction:** Subjective rating tracking mental calm regardless of daily work productivity.

131. **Locus of Control Score (Self-Reported)**

     - **Formula:** $\text{Binary/Scale Check-in: "Did you control your day or react to fires?" } [1..5]$

     - **Extraction:** Daily assessment measuring perceived agency versus reactive helplessness.

132. **Meaningfulness & Purpose Score (Self-Reported)**

     - **Formula:** $\text{Flag } (0 / 1) \text{ indicating at least one fulfilling daily event}$

     - **Extraction:** Nightly prompt recording existence of meaningful or satisfying experiences.

133. **Somatic Awareness Score (Self-Reported)**

     - **Formula:** $\text{Sum of Somatic Stress Indicators (Headache, Neck Tension, Eye Strain) logged per Day}$

     - **Extraction:** Quick physical check-in recording somatic manifestations of psychological stress.

134. **Burnout Vulnerability Index (Composite Metric)**

     - **Formula:** $\text{Risk Score} = \sigma(w_1 \cdot \text{LateNightShift} + w_2 \cdot \text{ContextSwitch} - w_3 \cdot \text{UnpluggedTime} - w_4 \cdot \text{EnergyScore})$

     - **Extraction:** Multi-factor algorithmic alert combining digital indicators with self-reported vitality.

135. **Mood Volatility Score (Composite Metric)**

     - **Formula:** $\text{Standard Deviation of Self-Reported Mood Scores over Rolling 14-Day Window}$

     - **Extraction:** Track emotional stability variance to identify mood swings or instability trends.

136. **Dopamine Reset Compliance (Composite Metric)**

     - **Formula:** $\frac{\text{Days per Month without Heavy Dopamine Apps before 12:00}}{\text{Days in Month}} \times 100\%$

     - **Extraction:** Proportion of days maintaining low-dopamine inputs during morning hours.

137. **Work-Recovery Equilibrium (Composite Metric)**

     - **Formula:** $\frac{\text{Deep Work Hours}}{\text{Analog Recovery Time} + \text{Sleep Duration}}$

     - **Extraction:** Ratio evaluating whether daily cognitive expenditure is balanced by restorative time.

138. **Mental Clutter Index (Composite Metric)**

     - **Formula:** $\text{Count of Open Pending Tasks without Due Dates} + \text{Unprocessed Inbox Items}$

     - **Extraction:** Measure unresolved open loops (Zeigarnik effect) adding to background mental clutter.

139. **Social Battery Drain Rate (Composite Metric)**

     - **Formula:** $\frac{\Delta \text{Mood/Energy Rating}}{\text{Hours Spent in Social Geofences / Intensive Messaging}}$

     - **Extraction:** Delta in post-social interaction energy score to identify introversion thresholds.

140. **Mental Resilience Score (Composite Metric)**

     - **Formula:** $\text{Composite Index } [0 \dots 100] = f(\text{Sleep Regularity}, \text{Exercise}, \text{Low Interruptions}, \text{Positive Start})$

     - **Extraction:** Overall daily psychological resilience shield score aggregated across all wellbeing feeds.

## Section 5. UX/UI Blueprint & Complete 140-Metric Interface Mapping

To display 140 metrics without cognitive overload, the system employs a **3-Layer Progressive Disclosure & Visual Component Architecture**.

### 5.1 Main Layout & Bento Grid Structure (Layer 1)

The home view limits visible information to 6–8 primary Bento Grid cards to prevent visual clutter:

```
+-----------------------------------------------------------------------------------------+
| [≡] PERSONAL DASHBOARD           [Search / Cmd + K]          (DEFCON: 5) [Ollama: OK]   |
+-----------------------------------------------------------------------------------------+
|  AI DAILY BRIEFING BANNER: "High focus expected today. Sleep window stable (+12m)."     |
+------------------------------------+----------------------------------------------------+
| CORE KPI BENTO GRID (Layer 1)      | SECONDARY / WELLBEING MODULE (Layer 1)            |
|                                    |                                                    |
|  [Deep Work Ratio: 68%] 🟢 (+8%)   |  [ Mental Battery Ring ]  [ System Health Status ] |
|  [Daily Burn Rate: $42] 🟡 (-$5)   |  - Resilience Score: 84   - Infra Stability: 99.8%  |
|  [Focus Block: 42 min] 🟢          |  - Dopamine Reset: OK     - Backup Age: 2.1h       |
|                                    |                                                    |
|  [Task Velocity: 6/8 Done]         |  [ AI & Code Density ]    [ Mobile & Mobility ]    |
|  ==================== 75%          |  - Tokens: 42.1k          - Unlocks: 2.4/h        |
|                                    |  - Local Ratio: 82%       - Places: 3 clusters     |
+------------------------------------+----------------------------------------------------+
| DRILL-DOWN TABS (Layer 2 - Detailed Views)                                              |
| [ Productivity ]  [ Financials ]  [ Telemetry & Security ]  [ Psychological Wellbeing ]|
+-----------------------------------------------------------------------------------------+
```

1. **Card 1: Mental & Physical Core (Hero Card - Double Width):** Features the "Mental Battery" ring (0–100%), energy levels, burnout risk, and a 7-day sleep trend sparkline.
2. **Card 2: Focus & Productivity:** Displays Deep Work Ratio, task velocity progress ring, and hourly focus distribution bars.
3. **Card 3: System Health & Infrastructure:** Shows status badges (`emerald-500` ok / pulsing `amber`/`rose` alerts) for servers, backup freshness, and vault integrity.
4. **Card 4: Financial Burn Rate:** Linear progress bar tracking daily expenditure against daily target budget allocations.
5. **Card 5: Geolocation & Mobility:** Distance walked, steps, and count of unique spatial clusters visited.

---

### 5.2 UI Component Patterns for Metric Rendering

- **Pattern A: Progressive Disclosure Cards (Accordions & Modals):** Groups related metrics (e.g., Psychological Health). Shows 3 core metrics on top, expands on click to reveal secondary metrics.
- **Pattern B: Micro-Sparklines & Trend Deltas:** Numeric metrics pair with borderless 7-day sparklines and percentage delta badges (`+12% vs yesterday`).
- **Pattern C: Semantic State Badges:** Visual alert encoding using status tones:
  - 🟢 **Emerald:** Stable / Normal.
  - 🟡 **Amber:** Caution / Impending Threshold (e.g., elevated distraction or burn rate).
  - 🔴 **Rose:** Critical Attention Required (e.g., burnout warning, low disk space).
- **Pattern D: Optimistic Self-Reporting Micro-Widgets:** Quick 1-click rating buttons (1–5 scale / emojis) integrated into the UI and Telegram bot for instant state updates.

---

### 5.3 Complete Mapping of all 140 Metrics to UI Placement

| Metric Range                                                                        | Metric Names                                                                                                                                                                                      | UI Layer & Visual Presentation                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1, 3, 7, 9, 11, 13, 24, 35**                                                      | Core Daily KPIs (Deep Work, Burn Rate, Task Velocity, Unlocks, Infra Health, Tokens, Local AI, Vault Health)                                                                                      | **Layer 1: Primary Bento Grid Cards.** Circular progress rings, large value callouts, and 7-day sparkline graphs.                                                                |
| **129, 130, 134, 140**                                                              | Key Mental Wellbeing (Energy & Vitality, Inner Peace, Burnout Risk, Mental Resilience)                                                                                                            | **Layer 1: Top-Right "Mental Battery Widget".** Soft gradient gauge with color-coded risk indicator.                                                                             |
| **2, 4, 5, 10, 15, 18, 20, 26, 27**                                                 | Work & Focus Mechanics (Late-Night Shift, Context Switches, Interruptions, CLI Ratio, Focus Length, Evening Drop)                                                                                 | **Layer 2: "Productivity & Focus" Module View.** Interactive timeline graphs showing focus blocks vs context switches across the day.                                            |
| **14, 25, 31, 34, 39, 82, 83, 85, 92, 100, 107, 108, 115**                          | Code, Git & Developer Ergonomics (Git Density, Shortcuts, CLI Commands, Matrix Flow, Clean Code, Prompt Density, Code-Life Ratio)                                                                 | **Layer 2: "Developer Hub" View.** GitHub-style contribution heatmaps, code aesthetic gauges, and terminal activity bars.                                                        |
| **6, 21, 36, 91, 98**                                                               | Mobility & Physical Activity (Daily Mobility, Doomscrolling, Unique Places, Wanderlust, Energy Footprint)                                                                                         | **Layer 2: "Mobility & Geo-Timeline" View.** Interactive Leaflet/Mapbox map overlaying GPS clusters with step-count bars.                                                        |
| **8, 28, 93**                                                                       | Media & Digital Consumption (Media Ratio, Audio Volume, Binge Factor)                                                                                                                             | **Layer 2: "Media & Culture" View.** Donut charts of app time distribution and stream history timelines.                                                                         |
| **16, 17, 22, 23, 29, 30, 32, 33, 37, 38, 40**                                      | System & Infrastructure Telemetry (Screen Deviation, Network Intensity, Update Lag, Inbox Zero, Sleep Variance, Backup Age, Reboot Freq)                                                          | **Layer 2: "System Admin & Infra" View.** Compact tabular layout with status badges (Emerald/Amber/Rose) and server uptime bars.                                                 |
| **41 - 80**                                                                         | Predictive Models & Analytics (Burnout Prob, Mood Forecast, Sleep Forecast, Impulse Spend, Sprint Success, Infra Failure, Cash Flow Crunch, Deadline Drift, Disk Full ETA, CI Failure Risk, etc.) | **Layer 3: Ambient Prediction Engine & Bot Alerts.** Displayed as "AI Forecast Chips" in header or sent as proactive Telegram notifications when threshold triggers ($P > 0.7$). |
| **81, 84, 86, 87, 88, 89, 90, 94, 95, 96, 97, 99, 101 - 106, 109 - 114, 116 - 120** | Custom, Philosophical & System Integrity Indices (Digital Entropy, Sovereignty Index, DEFCON, Offline Purity, Day Singularity, Automation Saved, Dashboard Integrity, etc.)                       | **Layer 3: Command Palette (`Cmd + K`) & System Diagnostics.** Searchable index catalog and periodic summary reports.                                                            |
| **121 - 128, 131, 132, 133, 135 - 139**                                             | Deep Psychological & Digital Biomarkers (Mental Restlessness, Compulsive Checks, Bedtime Revenge, Typing Micro-Frustration, Sentiment Score, Dopamine Reset, Social Battery Drain, etc.)          | **Layer 2: "Psychological Health & Wellbeing" Dedicated View.** Calming pastel charts, weekly trend curves, and reflection logs.                                                 |

<!-- prettier-ignore-end -->
