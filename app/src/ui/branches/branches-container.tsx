import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { FoldoutType, PopupType } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { BranchList } from './branch-list'
import { TabBar } from '../tab-bar'
import { BranchesTab } from '../../models/branches-tab'
import { assertNever } from '../../lib/fatal-error'
import { enablePRIntegration } from '../../lib/feature-flag'
import { PullRequestList } from './pull-request-list'
import { PullRequestsLoading } from './pull-requests-loading'
import { PullRequest } from '../../models/pull-request'
import { CSSTransitionGroup } from 'react-transition-group'

const PullRequestsLoadingCrossFadeInTimeout = 300
const PullRequestsLoadingCrossFadeOutTimeout = 200

interface IBranchesContainerProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly selectedTab: BranchesTab
  readonly pullRequests: ReadonlyArray<PullRequest>

  /** The pull request associated with the current branch. */
  readonly currentPullRequest: PullRequest | null

  /** Are we currently loading pull requests? */
  readonly isLoadingPullRequests: boolean
}

interface IBranchesContainerState {
  readonly selectedBranch: Branch | null
  readonly selectedPullRequest: PullRequest | null
  readonly branchFilterText: string
  readonly pullRequestFilterText: string
}

/** The unified Branches and Pull Requests component. */
export class BranchesContainer extends React.Component<
  IBranchesContainerProps,
  IBranchesContainerState
> {
  public constructor(props: IBranchesContainerProps) {
    super(props)

    this.state = {
      selectedBranch: props.currentBranch,
      selectedPullRequest: props.currentPullRequest,
      branchFilterText: '',
      pullRequestFilterText: '',
    }
  }

  private onItemClick = (branch: Branch) => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)

    const currentBranch = this.props.currentBranch

    if (currentBranch == null || currentBranch.name !== branch.name) {
      this.props.dispatcher.checkoutBranch(this.props.repository, branch)
    }
  }

  private onPullRequestFilterKeyDown = () =>
    this.closeFoldoutOnEsc(() => this.state.pullRequestFilterText.length === 0)
  private onBranchFilterKeyDown = () =>
    this.closeFoldoutOnEsc(() => this.state.branchFilterText.length === 0)

  private closeFoldoutOnEsc = (shouldCloseFoldout: () => boolean) => (
    event: React.KeyboardEvent<HTMLElement>
  ) => {
    if (event.key === 'Escape') {
      if (shouldCloseFoldout()) {
        this.props.dispatcher.closeFoldout(FoldoutType.Branch)
        event.preventDefault()
      }
    }
  }

  private onBranchFilterTextChanged = (text: string) => {
    this.setState({ branchFilterText: text })
  }

  private onPullRequestFilterTextChanged = (text: string) => {
    this.setState({ pullRequestFilterText: text })
  }

  private onBranchSelectionChanged = (selectedBranch: Branch | null) => {
    this.setState({ selectedBranch })
  }

  private onPullRequestSelectionChanged = (
    selectedPullRequest: PullRequest | null
  ) => {
    this.setState({ selectedPullRequest })
  }

  private renderTabBar() {
    if (!this.props.repository.gitHubRepository) {
      return null
    }

    if (!enablePRIntegration()) {
      return null
    }

    let countElement = null
    if (this.props.pullRequests) {
      countElement = (
        <span className="count">{this.props.pullRequests.length}</span>
      )
    }

    return (
      <TabBar
        onTabClicked={this.onTabClicked}
        selectedIndex={this.props.selectedTab}
      >
        <span>Branches</span>
        <span className="pull-request-tab">
          {__DARWIN__ ? 'Pull Requests' : 'Pull requests'}

          {countElement}
        </span>
      </TabBar>
    )
  }

  private renderSelectedTab() {
    let tab = this.props.selectedTab
    if (!enablePRIntegration() || !this.props.repository.gitHubRepository) {
      tab = BranchesTab.Branches
    }

    switch (tab) {
      case BranchesTab.Branches:
        return (
          <BranchList
            defaultBranch={this.props.defaultBranch}
            currentBranch={this.props.currentBranch}
            allBranches={this.props.allBranches}
            recentBranches={this.props.recentBranches}
            onItemClick={this.onItemClick}
            filterText={this.state.branchFilterText}
            onFilterKeyDown={this.onBranchFilterKeyDown()}
            onFilterTextChanged={this.onBranchFilterTextChanged}
            selectedBranch={this.state.selectedBranch}
            onSelectionChanged={this.onBranchSelectionChanged}
            canCreateNewBranch={true}
            onCreateNewBranch={this.onCreateBranchWithName}
          />
        )

      case BranchesTab.PullRequests: {
        return (
          <CSSTransitionGroup
            transitionName="cross-fade"
            component="div"
            id="pr-transition-div"
            transitionEnterTimeout={PullRequestsLoadingCrossFadeInTimeout}
            transitionLeaveTimeout={PullRequestsLoadingCrossFadeOutTimeout}
          >
            {this.renderPullRequests()}
          </CSSTransitionGroup>
        )
      }
    }

    return assertNever(tab, `Unknown Branches tab: ${tab}`)
  }

  private renderPullRequests() {
    if (this.props.isLoadingPullRequests) {
      return <PullRequestsLoading key="prs-loading" />
    }

    const pullRequests = this.props.pullRequests
    const repo = this.props.repository
    const name = repo.gitHubRepository
      ? repo.gitHubRepository.fullName
      : repo.name
    const isOnDefaultBranch =
      this.props.defaultBranch &&
      this.props.currentBranch &&
      this.props.defaultBranch.name === this.props.currentBranch.name

    return (
      <PullRequestList
        key="pr-list"
        pullRequests={pullRequests}
        selectedPullRequest={this.state.selectedPullRequest}
        repositoryName={name}
        isOnDefaultBranch={!!isOnDefaultBranch}
        onSelectionChanged={this.onPullRequestSelectionChanged}
        onCreateBranch={this.onCreateBranch}
        onCreatePullRequest={this.onCreatePullRequest}
        filterText={this.state.pullRequestFilterText}
        onFilterTextChanged={this.onPullRequestFilterTextChanged}
        onFilterKeyDown={this.closeFoldoutOnEsc(
          () => this.state.pullRequestFilterText.length === 0
        )}
        onItemClick={this.onPullRequestClicked}
        onDismiss={this.onDismiss}
      />
    )
  }

  public render() {
    return (
      <div className="branches-container">
        {this.renderTabBar()}
        {this.renderSelectedTab()}
      </div>
    )
  }

  private onCreateBranchWithName = (name: string) => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    this.props.dispatcher.showPopup({
      type: PopupType.CreateBranch,
      repository: this.props.repository,
      initialName: name,
    })
  }

  private onCreateBranch = () => {
    this.onCreateBranchWithName('')
  }

  private onCreatePullRequest = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    this.props.dispatcher.createPullRequest(this.props.repository)
  }

  private onTabClicked = (tab: BranchesTab) => {
    this.props.dispatcher.changeBranchesTab(tab)
  }

  private onPullRequestClicked = (pullRequest: PullRequest) => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    this.props.dispatcher.checkoutPullRequest(
      this.props.repository,
      pullRequest
    )

    this.onPullRequestSelectionChanged(pullRequest)
  }

  private onDismiss = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
  }
}
