import React from 'react'

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  extra?: React.ReactNode
  back?: React.ReactNode
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, description, extra, back }) => (
  <div className="page-header">
    <div className="page-header__main">
      {back}
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        {description && <div className="page-header__desc">{description}</div>}
      </div>
    </div>
    {extra && <div className="page-header__extra">{extra}</div>}
  </div>
)

export default PageHeader
