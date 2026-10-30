export function workstateMessages(locale: string) {
  return locale.toLowerCase().startsWith('ru')
    ? {
        telemetry: 'Телеметрия: агрегаты активности',
        telemetryConsent:
          'Разрешить отправку агрегатов активности на этот сервер? Текст ввода и команды не отправляются. Контекст отправляется только после отдельного подтверждения снимка.',
        smartBreak: 'Умные предложения перерыва',
        smartBreakConsent:
          'Предлагать перерыв после успешного test/commit и длительной активности? Требуется включённая телеметрия. По таймеру посреди ввода уведомлений не будет.',
        capture: 'Сохранить контекст работы…',
        chooseProject: 'Выбрать папку контекста…',
        chooseIde: 'Выбрать исполняемый файл IDE…',
        clear: 'Забыть папку и IDE',
        capturePrompt: 'Отправить этот контекст на сервер?',
        resumePrompt: 'Восстановить этот контекст?',
        save: 'Отправить',
        resume: 'Открыть',
        allow: 'Разрешить',
        cancel: 'Отмена',
        server: 'Сервер',
        app: 'Приложение',
        project: 'Папка проекта',
        branch: 'Ветка (только справка, без checkout)',
        ide: 'Локально выбранная IDE',
        folder: 'IDE не выбрана: папки откроются в Проводнике, не в IDE.',
        noText: 'Заголовки окон, текст ввода и вкладки браузера не собираются.',
        failed:
          'Действие не выполнено. Проверьте согласие на телеметрию, активность трекера и локальный путь. Пауза, блокировка, приватное окно или смена аккаунта отменяют операцию.',
        selected:
          'Выбранный путь сохранён только на этом компьютере. Папка попадёт на сервер лишь после подтверждения снимка.',
      }
    : {
        telemetry: 'Telemetry: activity aggregates',
        telemetryConsent:
          'Send activity aggregates to this server? Typed text and commands are never sent. Context is sent only after a separate snapshot confirmation.',
        smartBreak: 'Smart break suggestions',
        smartBreakConsent:
          'Suggest a break after a successful test/commit and sustained activity? Requires telemetry. No timer interruptions while typing.',
        capture: 'Save work context…',
        chooseProject: 'Choose context project folder…',
        chooseIde: 'Choose IDE executable…',
        clear: 'Forget folder and IDE',
        capturePrompt: 'Send this context to the server?',
        resumePrompt: 'Restore this context?',
        save: 'Send',
        resume: 'Open',
        allow: 'Allow',
        cancel: 'Cancel',
        server: 'Server',
        app: 'Application',
        project: 'Project folder',
        branch: 'Branch (reference only, no checkout)',
        ide: 'Locally selected IDE',
        folder:
          'No IDE selected: folders will open in File Explorer, not an IDE.',
        noText: 'Window titles, typed text and browser tabs are not collected.',
        failed:
          'Action not completed. Check telemetry consent, active tracking and the local path. Pause, lock, private windows or account changes cancel the operation.',
        selected:
          'The selected path is saved only on this computer. The project folder is sent only after snapshot confirmation.',
      };
}
