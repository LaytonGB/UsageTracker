/* 
*TODO 
  - Create tracker creation system
  - create tracker macro creator for +1

  - Tracker "creation" command creates tracker
    - List options:
      - Name
      - Notify (All | GMs | Script Activator)
      - Update system (Milestone | Formula | List)
      - View Formula Permissions (All | GMs | Creator)
      - Pause at level
      - Create "+1 Uses" Macro? (Yes | No)
  - Tracker "view" command lists trackers
    - Options to:
      - View All (Name, Creator, Formula, Etc)
      - View uses until next milestone (shows formula?)
      - Pause / Play Tracking (GM only)
      - Rename
      - Remove (are you sure?)
*/

const UsageTracker = (function() {
  const version = '1.0.0';

  type StateVar =
    | 'default_notify'
    | 'default_pause_after_milestone'
    | 'default_update_method'
    | 'default_formula_view_permissions'
    | 'default_create_macro'
    | 'tracker';

  type TrackerProperty =
    | 'name'
    | 'creator'
    | 'notify'
    | 'updateMethod'
    | 'viewPerm'
    | 'createdMacro';

  interface TrackerObject {
    name: string;
    creator: string;
    notify: string;
    updateMethod: string;
    viewPerm: string;
    pauseAtLevel: boolean;
    createdMacro: boolean;
  }

  type ActiveValue = 'true' | 'false';
  function isActiveValue(val: string): val is ActiveValue {
    return ['true', 'false'].includes(val);
  }

  type NotifyValue = 'milestone' | 'list' | 'algorithm';
  function isNotifyValue(val: string): val is NotifyValue {
    return ['milestone', 'list', 'algorithm'].includes(val);
  }

  /**
   * This is the interface used to check the "states" object, and to ensure that
   * all Roll20 state object changes go smoothly.
   * @param name A name for this setting. Because this name is to be added to the
   * states object, it is best to keep this name uniform.
   * @param acceptables Optional. Acceptable values for this state.
   * @param default Optional. The default value for this state.
   * @param ignore Optional. If true, this state will not be reset to default
   * regardless of if its current value is outside its acceptable values.
   * @param hide Optional. If true, this state will not show in the config menu.
   * @param customConfig Optional. Sets a custom dropdown menu for the config button.
   */
  interface StateForm {
    name: StateVar;
    acceptables?: string[];
    default?: string;
    ignore?: ActiveValue;
    hide?: ActiveValue;
    customConfig?: string;
  }

  interface MacroForm {
    name: string;
    action: string;
    visibleto?: string;
  }

  interface HelpForm {
    name: string;
    desc: string[];
    example?: string[];
    link?: StateVar;
  }

  const stateName = 'UsageTracker';
  const states: StateForm[] = [
    {
      name: 'default_notify',
      acceptables: ['all', 'gm', 'creator'],
      default: 'all'
    },
    {
      name: 'default_update_method',
      acceptables: ['milestone', 'list', 'algorithm'],
      default: 'milestone'
    },
    {
      name: 'default_formula_view_permissions',
      acceptables: ['all', 'gm', 'creator'],
      default: 'all'
    },
    {
      name: 'default_pause_after_milestone',
      acceptables: ['false', 'true'],
      default: 'false'
    },
    {
      name: 'default_create_macro'
    },
    {
      name: 'tracker',
      ignore: 'true',
      hide: 'true'
    }
  ];

  const name = 'Usage Tracker';
  const nameError = name + ' ERROR';
  const nameLog = name + ': ';
  const apiCall = '!ut';

  let playerName: string, playerID: string, parts: string[];

  /**
   * Checks each macro from the macroArr array to ensure their functions are up to date.
   */
  function checkMacros() {
    const playerList = findObjs({ _type: 'player', _online: true });
    const gm = playerList.find((player) => {
      return playerIsGM(player.id) === true;
    }) as Player;
    const macroArr: MacroForm[] = [
      {
        name: 'CreateTracker',
        action: apiCall + ' --add ?{Name?}' + getUpdateDefaults()
      }
    ];
    macroArr.forEach((macro) => {
      const macroObj = findObjs({
        _type: 'macro',
        name: macro.name
      })[0] as Macro;
      if (macroObj) {
        if (macroObj.get('visibleto') !== 'all') {
          macroObj.set('visibleto', 'all');
          toChat(`**Macro '${macro.name}' was made visible to all.**`, true);
        }
        if (macroObj.get('action') !== macro.action) {
          macroObj.set('action', macro.action);
          toChat(`**Macro '${macro.name}' was corrected.**`, true);
        }
      } else if (gm && playerIsGM(gm.id)) {
        createObj('macro', {
          _playerid: gm.id,
          name: macro.name,
          action: macro.action,
          visibleto: 'all'
        });
        toChat(
          `**Macro '${macro.name}' was created and assigned to ${gm.get(
            '_displayname'
          ) + ' '.split(' ', 1)[0]}.**`,
          true
        );
      }
    });

    function getUpdateDefaults(): string {
      let output = '';
      states
        .filter((s) => {
          return s.name.includes('default_');
        })
        .map((s) => {
          return {
            name: s.name,
            values: [
              ...new Set([
                getState(s.name) as string,
                ...(s.acceptables || ['true', 'false'])
              ])
            ]
          };
        })
        .map((s) => {
          return {
            name: s.name,
            values: s.values.reduce((a, b) => {
              return a + '|' + b;
            })
          };
        })
        .forEach((s) => {
          const nameParts = s.name.split('_').slice(1);
          const name =
            nameParts
              .map((s) => {
                return s[0].toUpperCase() + s.slice(1);
              })
              .reduce((a, b) => {
                return a + ' ' + b;
              }) + '?';
          output += '|?{' + name + '|' + s.values + '}';
        });
      return output;
    }
  }

  /**
   * Outputs help interface to the roll20 chat.
   */
  function showHelp() {
    const commandsArr: HelpForm[] = [
      // {
      //   name: `${apiCall} help`,
      //   desc: ['Lists all commands, their parameters, and their usage.']
      // }
    ];
    toChat(
      '&{template:default} {{name=' +
        '**VERSION**' +
        '}} {{Current=' +
        version +
        '}}',
      undefined,
      playerName
    );
    commandsArr.forEach((command) => {
      let output =
        '&{template:default} {{name=' + code(command.name) + '}}{{Function=';
      for (let i = 0; i < command.desc.length; i++) {
        if (i % 2 === 1) {
          output += '{{=';
        }
        output += command.desc[i] + '}}';
      }
      if (command.link !== undefined) {
        output += '{{Current Setting=' + getState(command.link) + '}}';
      }
      toChat(output, undefined, playerName);
    });
  }

  function showConfig() {
    let output = `&{template:default} {{name=${name} Config}}`;
    states.forEach((s) => {
      if (s.hide == 'true') {
        return;
      }
      const acceptableValues = s.acceptables
        ? s.acceptables
        : ['true', 'false'];
      const defaultValue = s.default ? s.default : 'true';
      const currentValue = getState(s.name);
      const stringVals =
        s.customConfig == undefined
          ? valuesToString(acceptableValues, defaultValue)
          : s.customConfig;
      output += `{{${s.name}=[${currentValue}](${apiCall} config ${s.name} ?{New ${s.name} value${stringVals}})}}`;
    });
    output += `{{**CAUTION**=[CLEAR ALL](!&#13;?{Are you sure? All custom paladin targets will be lost|Cancel,|I am sure,${apiCall} RESET})}}`;
    toChat(output, undefined, playerName);

    /**
     * Moves the default value to the start of the array and presents
     * all acceptable values in a drop-down menu format.
     * @param values Acceptable values array.
     * @param defaultValue The state's default value.
     */
    function valuesToString(values: string[], defaultValue: string) {
      let output = '';
      const index = values.indexOf(defaultValue);
      if (index !== -1) {
        values.splice(index, 1);
        values.unshift(defaultValue);
      }
      values.forEach((v) => {
        output += '|' + v;
      });
      return output;
    }
  }

  /**
   * Sets the setting with name equal to @param parts[2] equal to @param parts[3].
   * @param parts An Array of strings, each part is a section of the incoming message.
   */
  function setConfig(parts: string[]): void {
    toChat(
      '**' +
        parts[2] +
        '** has been changed **from ' +
        getState(parts[2] as StateVar) +
        ' to ' +
        parts[3] +
        '**.',
      true,
      'gm'
    );
    setState(parts[2] as StateVar, parts[3]);
    showConfig();
  }

  function handleInput(msg: ApiChatEventData) {
    parts = msg.content.split('--').map((s) => {
      return s.trim();
    });
    if (msg.type == 'api' && parts[0] == apiCall) {
      playerName = msg.who.split(' ', 1)[0];
      playerID = msg.playerid;
      const thisCommand = parts[1].split(' ', 1)[0];
      if (['add'].includes(thisCommand)) {
        switch (thisCommand) {
          case 'add':
            handleAddTracker(msg);
            break;
          default:
            error('Command ' + code(msg.content) + ' not understood.', -1);
            return;
        }
      } else {
        error('Command ' + code(msg.content) + ' not understood.', 0);
      }
    }
  }

  // Example message:
  // "!ut --add this name|notify|updateMethod|viewPerm|pauseAtLevel|createMacro"
  function handleAddTracker(msg: ApiChatEventData) {
    const createdTrackers: string[] = [];
    const creator = msg.playerid;
    const strings: string[][] = [];
    msg.content.split('--').forEach((p, i) => {
      if (i > 0) {
        strings.push(p.slice(4).split('|'));
      }
    });
    strings.forEach((s) => {
      const name = s[0];
      createdTrackers.push(name);
      const notify = s[1];
      const updateMethod = s[2];
      const viewPerm = s[3];
      const pauseAtLevel = s[4] == 'true';
      const createdMacro = s[5] == 'true';
      createTracker({
        creator: creator,
        name: name,
        notify: notify,
        updateMethod: updateMethod,
        viewPerm: viewPerm,
        pauseAtLevel: pauseAtLevel,
        createdMacro: createdMacro
      });
    });
    const trackersString = createdTrackers.reduce((a, b) => {
      return a + ', ' + b;
    });
    toChat('Created ' + trackersString + ' tracker(s).', true);
  }

  function createTracker(TrackerObj: TrackerObject) {
    if (getTracker(TrackerObj.name) == undefined) {
      setTracker(TrackerObj);
    } else {
      error(
        'A usage tracker named "' +
          name +
          '" already exists. Tracker creation cancelled.',
        4
      );
    }
  }

  function getTracker(value: string) {
    return state[stateName].tracker[value];
  }

  function setTracker(trackerObj: TrackerObject): void {
    state[stateName].tracker[trackerObj.name] = trackerObj;
  }

  /**
   * @param charID A character ID string.
   * @param name The attribute name.
   * @returns The attribute if found, else undefined.
   */
  function getAttr(charID: string, name: string): Attribute {
    const attrs = findObjs({
      _type: 'attribute',
      _characterid: charID,
      name: name
    }) as Attribute[];
    if (attrs.length > 0) {
      return attrs[0];
    }
    return;
  }

  /**
   * Find the attribute and sets its 'current' value. If the attribute
   * cannot be found it is instead created.
   * @param charID A character ID string.
   * @param name The attribute name.
   * @param value The value to set the attribute to.
   * @param dontOverwrite If true, the attribute's current value will not be overwritten,
   * unless the attribute was newly created.
   * @returns The attribute after the change.
   */
  function setAttr(
    charID: string,
    name: string,
    value?: string,
    dontOverwrite?: boolean
  ): Attribute {
    let attr = getAttr(charID, name);
    let goingToOverwrite: boolean;
    if (attr == undefined || attr.get('current').trim() == '') {
      goingToOverwrite = false;
      attr = createObj('attribute', {
        _characterid: charID,
        name: name
      });
    }
    if (
      value != undefined &&
      // so long as goingToOverwrite and dontOverwrite are not both true
      (goingToOverwrite == false || dontOverwrite != true)
    ) {
      attr.setWithWorker('current', value);
    }
    return attr;
  }

  // can also return a string in the case of "status_marker" StateVar,
  // but is never checked by code
  function getState(value: StateVar) {
    return state[stateName][value];
  }

  function setState(targetState: StateVar, newValue: string): void {
    let valid: boolean;
    switch (targetState) {
      default:
        error('State not found.', -3);
        return;
    }
    if (valid) {
      state[stateName][targetState] = newValue;
    } else {
      error(
        'Tried to set state "' +
          targetState +
          '" with unacceptable value "' +
          newValue +
          '".',
        -2
      );
    }
  }

  function code(snippet: string) {
    return (
      '<span style="background-color: rgba(0, 0, 0, 0.5); color: White; padding: 2px; border-radius: 3px;">' +
      snippet +
      '</span>'
    );
  }

  function toChat(message: string, success?: boolean, target?: string): void {
    const whisper = target ? '/w ' + target + ' ' : '';
    let style = '<div>';
    if (success === true) {
      style =
        '<br><div style="background-color: #5cd65c; color: Black; padding: 5px; border-radius: 10px;">';
    } else if (success === false) {
      style =
        '<br><div style="background-color: #ff6666; color: Black; padding: 5px; border-radius: 10px;">';
    }
    sendChat(name, whisper + style + message + '</div>');
  }

  function error(error: string, code: number) {
    if (playerName) {
      sendChat(
        nameError,
        `/w ${playerName} <br><div style='background-color: #ff6666; color: Black; padding: 5px; border-radius: 10px;'>**${error}** Error code ${code}.</div>`
      );
    } else {
      sendChat(
        nameError,
        `<br><div style='background-color: #ff6666; color: Black; padding: 5px; border-radius: 10px;'>**${error}** Error code ${code}.</div>`
      );
    }
    log(nameLog + error + ` Error code ${code}.`);
  }

  function startupChecks() {
    checkStates();
  }

  function checkStates(): void {
    let changedStates = 0,
      lastState: string,
      lastOldValue: string,
      lastNewValue: string;
    states.forEach((s) => {
      const acceptables = s.acceptables ? s.acceptables : ['true', 'false'];
      const defaultVal = s.default ? s.default : 'true';
      if (
        getState(s.name) == undefined ||
        (!acceptables.includes(getState(s.name)) && s.ignore != 'true')
      ) {
        changedStates++;
        lastState = s.name;
        lastOldValue = getState(s.name);
        lastNewValue = defaultVal;
        setState(s.name, defaultVal);
      }
    });
    if (changedStates == 1) {
      error(
        '"' +
          lastState +
          '" value was "' +
          lastOldValue +
          '" but has now been set to its default value, "' +
          lastNewValue +
          '".',
        -1
      );
    } else if (changedStates > 1) {
      toChat(
        '**Multiple settings were wrong or un-set. They have now been corrected. ' +
          'If this is your first time running the PaladinAura API, this is normal.**',
        true
      );
    }
  }

  function registerEventHandlers() {
    on('chat:message', handleInput);
  }

  return {
    CheckMacros: checkMacros,
    StartupChecks: startupChecks,
    RegisterEventHandlers: registerEventHandlers
  };
})();

on('ready', () => {
  UsageTracker.CheckMacros();
  UsageTracker.StartupChecks();
  UsageTracker.RegisterEventHandlers();
});
